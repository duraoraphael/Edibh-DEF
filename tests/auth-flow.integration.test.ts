import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test, mock } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, deleteDoc, updateDoc, serverTimestamp, terminate } from "firebase/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

const projectId = "demo-upload-fix";
const app = initializeApp({ projectId, apiKey: "demo-key" }, "full-auth-flow");
const auth = getAuth(app);
const db = getFirestore(app);
let env: RulesTestEnvironment;
let service: typeof import("../src/lib/auth-service.ts");
const originalFetch = globalThis.fetch;
const email = "full-flow@example.invalid";
const password = "  Keep Password!  ";
let uid: string;
const gates: Array<{ path: string; body: Record<string, string> }> = [];
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8") } });
  await env.clearFirestore();
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8180);
  mock.module("../src/lib/firebase.ts", { namedExports: { auth, db } });
  globalThis.fetch = async (input, init) => {
    if (typeof input === "string" && input.startsWith("/api/auth/")) {
      gates.push({ path: input, body: JSON.parse(init?.body as string) });
      return Response.json({ ok: true });
    }
    return originalFetch(input, init);
  };
  service = await import("../src/lib/auth-service.ts");
});
after(async () => { globalThis.fetch = originalFetch; await signOut(auth); await terminate(db); await deleteApp(app); await env.cleanup(); });

test("real signup creates exactly one own pending viewer profile with server timestamp", async () => {
  const profile = await service.signUpAccount(" Full Test ", " FULL-FLOW@EXAMPLE.INVALID ", password);
  uid = profile.id;
  assert.equal(auth.currentUser?.uid, uid);
  const data = (await getDocFromServer(doc(db, "users", uid))).data()!;
  assert.equal(data.uid, uid); assert.equal(data.name, "Full Test");
  assert.equal(data.email, email); assert.equal(data.role, "visualizador");
  assert.equal(data.status, "pendente"); assert.equal(data.approved, false);
  assert.ok(data.createdAt.toDate() instanceof Date);
  assert.equal(gates.length, 1);
});
test("duplicate signup yields Firebase email-already-in-use and preserves profile", async () => {
  await signOut(auth);
  await assert.rejects(service.signUpAccount("Duplicate", email, password), { code: "auth/email-already-in-use" });
});
test("correct pending login succeeds and the server gate never receives a password", async () => {
  const profile = await service.signInAccount(email, password);
  assert.equal(profile.id, uid); assert.equal(profile.status, "pendente");
  assert.equal(gates.at(-1)?.body.password, undefined);
  await assert.rejects(getDocFromServer(doc(db, "records", "internal")), { code: "permission-denied" });
});
test("wrong password reports Authentication error without touching the profile", async () => {
  await signOut(auth);
  await assert.rejects(service.signInAccount(email, "wrong"));
  assert.equal(auth.currentUser, null);
});
test("Auth orphan reproduces duplicate signup; correct login safely repairs only missing profile", async () => {
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), "users", uid)));
  await assert.rejects(service.signUpAccount("Duplicate", email, password), { code: "auth/email-already-in-use" });
  const profile = await service.signInAccount(email, password);
  assert.equal(profile.id, uid); assert.equal(profile.role, "visualizador");
  assert.equal(profile.status, "pendente"); assert.equal(profile.approved, false);
});
test("self cannot approve, change UID, elevate role or create another profile", async () => {
  for (const data of [{ approved: true }, { uid: "another" }, { role: "admin" }, { status: "ativo" }]) {
    await assert.rejects(updateDoc(doc(db, "users", uid), data), { code: "permission-denied" });
  }
  await assert.rejects(setDoc(doc(db, "users", "another"), { uid: "another", email, role: "visualizador", status: "pendente", approved: false, createdAt: serverTimestamp() }), { code: "permission-denied" });
});
test("authorized approval persists across logout/login and profile repair never downgrades it", async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "users", uid), { role: "tecnico", status: "ativo", approved: true }));
  await signOut(auth);
  const profile = await service.signInAccount(email, password);
  assert.equal(profile.role, "tecnico"); assert.equal(profile.approved, true);
  const again = await service.recoverCurrentProfile();
  assert.equal(again.status, "ativo");
  await getDocFromServer(doc(db, "records", "internal"));
});
test("incomplete legacy profile authenticates with safe in-memory defaults and is preserved", async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "users", uid), { name: "Preserve", email }));
  const profile = await service.recoverCurrentProfile();
  assert.equal(profile.role, "visualizador");
  assert.equal(profile.status, "ativo");
  assert.equal(profile.uid, uid);
  assert.equal((await getDocFromServer(doc(db, "users", uid))).data()?.role, undefined);
});
test("Firestore-only profile does not create Auth account or authenticate", async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "users", "ghost-uid"), { email: "ghost@example.invalid", role: "visualizador", status: "pendente" }));
  await signOut(auth);
  await assert.rejects(service.signInAccount("ghost@example.invalid", password));
  assert.equal(auth.currentUser, null);
});
test("missing-profile recovery after reload uses current authenticated UID", async () => {
  const account = await createUserWithEmailAndPassword(auth, "reload-orphan@example.invalid", password);
  const profile = await service.recoverCurrentProfile();
  assert.equal(profile.id, account.user.uid); assert.equal(profile.approved, false);
});
