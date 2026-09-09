// Opt-in production probe. Creates and removes only its own disposable user,
// flow, approval, audit log and attachment. Never targets pre-existing data.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { deleteApp } from "firebase/app";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDocFromServer, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (project !== "cim-normatel-ac5b7") throw new Error("Unexpected Firebase project");
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: project,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
if (Object.values(config).some(value => !value)) throw new Error("Missing public Firebase config");

const { auth, db, storage } = await import("../src/lib/firebase.ts");
const localRequire = createRequire(path.resolve("package.json"));
const cliSession = JSON.parse(await fs.readFile(path.join(os.homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
const adminToken = (await localRequire("firebase-tools/lib/auth").getAccessToken(cliSession.tokens?.refresh_token, [])).access_token;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${project}`;

async function api(url, options = {}, allow404 = false) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(25_000),
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`Admin API ${new URL(url).hostname}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const email = `codex-record-${crypto.randomUUID()}@example.invalid`;
const password = `${crypto.randomUUID()}!Aa1`;
const name = "Codex disposable record probe";
const recordId = `codex-record-${crypto.randomUUID()}`;
const attachmentId = crypto.randomUUID();
let uid;
let objectRef;
let counterBefore;
let expectedCounterValue;
let recordNumber;

try {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  uid = credential.user.uid;
  await setDoc(doc(db, "users", uid), {
    uid, name, email, role: "visualizador", status: "pendente", approved: false,
    avatarUrl: "", department: "", createdAt: serverTimestamp(), lastActive: serverTimestamp(),
  });
  await api(`${base}/users/${uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=status&updateMask.fieldPaths=approved`, {
    method: "PATCH",
    body: JSON.stringify({ fields: {
      role: { stringValue: "tecnico" }, status: { stringValue: "ativo" }, approved: { booleanValue: true },
    } }),
  });

  const year = new Date().getFullYear();
  const counterId = `recordCounter_${year}`;
  counterBefore = await api(`${base}/settings/${counterId}`, {}, true);
  if (!counterBefore?.fields?.value?.integerValue) throw new Error("Production counter is absent; probe stopped without allocating a number");
  expectedCounterValue = Number(counterBefore.fields.value.integerValue) + 1;

  const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137]);
  const objectPath = `attachments/${uid}/${recordId}/${attachmentId}.png`;
  objectRef = ref(storage, objectPath);
  await uploadBytes(objectRef, bytes, { contentType: "image/png" });
  const attachment = { id: attachmentId, name: "probe.png", path: objectPath, url: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${encodeURIComponent(objectPath)}?alt=media`, size: bytes.length, contentType: "image/png" };

  const { createRecordWithSequentialNumber } = await import("../src/lib/forms.ts");
  recordNumber = await createRecordWithSequentialNumber(
    recordId,
    number => ({ recordNumber: number, status: "pendente", authorId: uid, authorName: name, attachments: [attachment], formId: "default", data: { instalacao: "Probe", sistema: "Probe", equipamento: "Probe", gerencia: "Probe", data: new Date().toISOString().slice(0, 10) }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    number => ({ recordId, recordNumber: number, authorId: uid, status: "pendente", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    { uid, name, role: "tecnico" },
  );

  const [record, approval, storedBytes] = await Promise.all([
    getDocFromServer(doc(db, "records", recordId)),
    getDocFromServer(doc(db, "approvals", recordId)),
    getBytes(objectRef),
  ]);
  const logs = await api(`${base}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "logs" }],
    where: { fieldFilter: { field: { fieldPath: "actorId" }, op: "EQUAL", value: { stringValue: uid } } },
  } }) });
  const audit = logs.find(row => row.document?.fields?.recordId?.stringValue === recordId)?.document;
  if (!record.exists() || record.data().recordNumber !== recordNumber) throw new Error("Record verification failed");
  if (!approval.exists() || approval.data().recordNumber !== recordNumber) throw new Error("Approval verification failed");
  if (!audit?.fields?.createdAt?.timestampValue || audit.fields.actorRole?.stringValue !== "tecnico") throw new Error("Audit verification failed");
  if (storedBytes.byteLength !== bytes.byteLength) throw new Error("Attachment verification failed");
  console.log(JSON.stringify({ result: "passed", uid, recordId, recordNumber, attachmentBytes: storedBytes.byteLength, auditTimestamp: "server" }));
} catch (error) {
  console.error(JSON.stringify({ result: "failed", code: error?.code || "unknown", operation: "production-record-probe" }));
  throw error;
} finally {
  if (objectRef) await deleteObject(objectRef).catch(error => {
    if (error?.code !== "storage/object-not-found") throw error;
  });
  if (uid) {
    const logs = await api(`${base}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "logs" }],
      where: { fieldFilter: { field: { fieldPath: "actorId" }, op: "EQUAL", value: { stringValue: uid } } },
    } }) }).catch(() => []);
    for (const row of logs) if (row.document?.fields?.actorId?.stringValue === uid) await api(`https://firestore.googleapis.com/v1/${row.document.name}`, { method: "DELETE" });
    await api(`${base}/approvals/${recordId}`, { method: "DELETE" }, true);
    await api(`${base}/records/${recordId}`, { method: "DELETE" }, true);
    await api(`${base}/users/${uid}`, { method: "DELETE" }, true);
    const account = await api(`${authBase}/accounts:lookup`, { method: "POST", body: JSON.stringify({ email: [email] }) });
    if (account.users?.[0]?.localId && account.users[0].localId !== uid) throw new Error("Cleanup UID mismatch");
    if (account.users?.[0]) await api(`${authBase}/accounts:delete`, { method: "POST", body: JSON.stringify({ localId: uid }) });
  }
  if (counterBefore && expectedCounterValue) {
    const year = new Date().getFullYear();
    const counterId = `recordCounter_${year}`;
    const current = await api(`${base}/settings/${counterId}`, {}, true);
    if (current && Number(current.fields?.value?.integerValue) === expectedCounterValue && current.fields?.lastRecordId?.stringValue === recordId) {
      const keys = Array.from(new Set([...Object.keys(current.fields || {}), ...Object.keys(counterBefore.fields || {})]));
      const masks = keys.map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
      await api(`${base}/settings/${counterId}?${masks}&currentDocument.updateTime=${encodeURIComponent(current.updateTime)}`, {
        method: "PATCH", body: JSON.stringify({ fields: counterBefore.fields }),
      });
      console.log(JSON.stringify({ cleanup: "confirmed-disposable-resources-and-counter", uid, recordId }));
    } else {
      console.log(JSON.stringify({ cleanup: "confirmed-disposable-resources-counter-not-restored-due-concurrent-write", uid, recordId }));
    }
  }
  await deleteApp(auth.app);
}
