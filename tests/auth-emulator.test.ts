import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";

const projectId = "demo-upload-fix";
const app = initializeApp({ projectId, apiKey: "demo-key" }, "auth-tests");
const auth = getAuth(app);
const origin = "http://127.0.0.1:9099";
const email = "auth-test@example.invalid";
const password = "  Exact Password!  ";
let uid: string;
before(async () => {
  connectAuthEmulator(auth, origin, { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  uid = credential.user.uid;
  await signOut(auth);
});
after(async () => { await signOut(auth); await deleteApp(app); });

test("Firebase SDK accepts valid password without trimming; token refresh and signout", async () => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(credential.user.uid, uid);
  assert.ok(await credential.user.getIdToken(true));
  await signOut(auth);
  assert.equal(auth.currentUser, null);
});
test("Firebase SDK rejects wrong password and unknown user", async () => {
  await assert.rejects(signInWithEmailAndPassword(auth, email, password.trim()));
  await assert.rejects(signInWithEmailAndPassword(auth, "absent@example.invalid", password));
});
test("password recovery creates an out-of-band reset code in the emulator only", async () => {
  await sendPasswordResetEmail(auth, email);
  const response = await fetch(`${origin}/emulator/v1/projects/${projectId}/oobCodes`);
  const data = await response.json();
  assert.ok(data.oobCodes.some((c: { email: string; requestType: string }) => c.email === email && c.requestType === "PASSWORD_RESET"));
});
test("Firebase SDK rejects disabled account and revoked session", async () => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const response = await fetch(`${origin}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId: uid, disableUser: true }),
  });
  assert.equal(response.status, 200);
  await assert.rejects(credential.user.getIdToken(true));
  await signOut(auth);
  await assert.rejects(signInWithEmailAndPassword(auth, email, password), { code: "auth/user-disabled" });
});
