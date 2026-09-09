import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test, mock } from "node:test";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, getDocFromServer, setDoc, runTransaction } from "firebase/firestore";
import { getBytes, ref } from "firebase/storage";

let env: RulesTestEnvironment;
let save: typeof import("../src/lib/forms.ts").saveRecordWithFixedNumber;
let routeAllowed: typeof import("../src/lib/forms.ts").isRouteAllowed;
let create: typeof import("../src/lib/forms.ts").createRecordWithSequentialNumber;
let upload: typeof import("../src/lib/attachment-upload.ts").uploadAttachment;
let remove: typeof import("../src/lib/attachment-upload.ts").deleteOwnedAttachment;
let db: ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;
let storage: ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["storage"]>;
const journal = new Map();
before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT || "demo-upload-fix",
    firestore: { host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9299, rules: readFileSync("storage.rules", "utf8") },
  });
  await env.clearFirestore(); await env.clearStorage();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users", "uploader"), { role: "tecnico", status: "ativo", name: "Test" });
  });
  const context = env.authenticatedContext("uploader");
  db = context.firestore(); storage = context.storage();
  mock.module("../src/lib/firebase.ts", { namedExports: { db, storage, auth: { currentUser: { uid: "uploader", getIdToken: async () => "emulated" } } } });
  Object.defineProperty(globalThis, "localStorage", { value: { setItem: (k: string, v: string) => journal.set(k, v), removeItem: (k: string) => journal.delete(k) }, configurable: true });
  const forms = await import("../src/lib/forms.ts");
  create = forms.createRecordWithSequentialNumber;
  save = forms.saveRecordWithFixedNumber;
  routeAllowed = forms.isRouteAllowed;
  const uploads = await import("../src/lib/attachment-upload.ts");
  upload = uploads.uploadAttachment; remove = uploads.deleteOwnedAttachment;
});
after(async () => { await env?.cleanup(); });

const record = (number: string) => ({ recordNumber: number, authorId: "uploader", authorName: "Test", status: "pendente", data: {}, createdAt: new Date().toISOString() });
const approval = (number: string) => ({ recordNumber: number, authorId: "uploader", status: "pendente" });

test("record without photo commits; concurrent retry preserves one number and approval", async () => {
  const [a, b] = await Promise.all([create("no-photo", record, approval, actor), create("no-photo", record, approval, actor)]);
  assert.equal(a, b);
  assert.equal((await getDocFromServer(doc(db, "records", "no-photo"))).data()?.recordNumber, a);
  assert.ok((await getDocFromServer(doc(db, "approvals", "no-photo"))).exists());
});

for (const [ext, mime] of [["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["pdf", "application/pdf"]]) {
  test(`${ext}: upload, URL, record commit, server reload, download and authorized deletion`, async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = new File([bytes], `photo.${ext}`, { type: mime });
    const id = `record-${ext}`;
    const { attachment } = await upload(file, "uploader", id, `file-${ext}`, () => {});
    await create(id, number => ({ ...record(number), attachments: [attachment] }), approval, actor);
    const stored = (await getDocFromServer(doc(db, "records", id))).data();
    assert.equal(stored?.attachments[0].url, attachment.url);
    assert.deepEqual(new Uint8Array(await getBytes(ref(storage, attachment.path))), bytes);
    await setDoc(doc(db, "records", id), { attachments: [] }, { merge: true });
    await remove(attachment.path, "uploader");
    await assert.rejects(getBytes(ref(storage, attachment.path)), { code: "storage/object-not-found" });
  });
}

test("Firestore rejection after upload leaves no record; compensation deletes the new object", async () => {
  const { attachment } = await upload(new File(["png"], "photo.png", { type: "image/png" }), "uploader", "rejected", "file-rejected", () => {});
  await assert.rejects(create("rejected", number => ({ ...record(number), authorId: "another-user", attachments: [attachment] }), approval, actor));
  assert.equal((await getDocFromServer(doc(db, "records", "rejected"))).exists(), false);
  await remove(attachment.path, "uploader");
  await assert.rejects(getBytes(ref(storage, attachment.path)), { code: "storage/object-not-found" });
});

const actor = { uid: "uploader", name: "Test", role: "tecnico" };
test("submission commits mandatory audit; invalid actor rolls back the record and counter", async () => {
  const number = await create("with-audit", record, approval, actor);
  await env.withSecurityRulesDisabled(async context => {
    const logs = await getDocs(collection(context.firestore(), "logs"));
    const log = logs.docs.find(d => d.data().recordId === "with-audit");
    assert.ok(log);
    assert.equal(typeof log.data().createdAt?.toDate, "function", "audit timestamp must be assigned by Firestore");
  });
  await create("with-audit", record, approval, actor);
  await assert.rejects(create("bad-audit", record, approval, { ...actor, name: "Forged" }));
  assert.equal((await getDocFromServer(doc(db, "records", "bad-audit"))).exists(), false);
  assert.equal((await getDocFromServer(doc(db, "records", "with-audit"))).data()?.recordNumber, number);
});

test("reproduces technician pending-approval rewrite denial; edit succeeds preserving approval", async () => {
  const number = await create("edit-pending", record, approval, actor);
  await assert.rejects(runTransaction(db, async tx => {
    tx.set(doc(db, "records", "edit-pending"), record(number), { merge: true });
    tx.set(doc(db, "approvals", "edit-pending"), approval(number));
  }), { code: "permission-denied" });
  await save("edit-pending", number, n => ({ ...record(n), data: { equipment: "updated" } }), approval, actor);
  assert.equal((await getDocFromServer(doc(db, "records", "edit-pending"))).data()?.data.equipment, "updated");
  assert.equal((await getDocFromServer(doc(db, "approvals", "edit-pending"))).data()?.status, "pendente");
});

test("technician edits an approved own record without resetting its approval", async () => {
  const number = await create("edit-approved", record, approval, actor);
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "records", "edit-approved"), { status: "aprovado" }, { merge: true });
    await setDoc(doc(context.firestore(), "approvals", "edit-approved"), { status: "aprovado", reviewerId: "admin" }, { merge: true });
  });
  await save("edit-approved", number, record, approval, actor);
  assert.equal((await getDocFromServer(doc(db, "records", "edit-approved"))).data()?.status, "aprovado");
  assert.equal((await getDocFromServer(doc(db, "approvals", "edit-approved"))).data()?.reviewerId, "admin");
});

test("viewer can only access Dashboard and History; unknown roles fail closed", () => {
  assert.equal(routeAllowed("visualizador", "/dashboard"), true);
  assert.equal(routeAllowed("visualizador", "/records"), true);
  for (const path of ["/records/new", "/cases", "/audit", "/users", "/profile"]) assert.equal(routeAllowed("visualizador", path), false);
  assert.equal(routeAllowed("invalid" as "admin", "/dashboard"), false);
});

for (const role of ["admin", "gerente", "tecnico"] as const) {
  test(`${role}: approved and legacy submission succeeds; pending submission fails`, async () => {
    try {
      for (const status of ["ativo", undefined, "pendente"] as const) {
        await env.withSecurityRulesDisabled(async context => {
          await setDoc(doc(context.firestore(), "users", "uploader"), { name: "Test", role, ...(status ? { status } : {}) });
        });
        const operation = create(`${role}-${status || "legacy"}`, record, approval, { ...actor, role });
        if (status === "pendente") await assert.rejects(operation, { code: "permission-denied" });
        else assert.ok(await operation);
      }
    } finally {
      await env.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), "users", "uploader"), { name: "Test", role: "tecnico", status: "ativo" });
      });
    }
  });
}
