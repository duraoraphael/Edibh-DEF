import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut, confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from "firebase/auth";

test("native reset code accepts a new password and rejects the old password", async () => {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "Run through Firebase Auth emulator");
  const projectId = "demo-upload-fix";
  const app = initializeApp({ projectId, apiKey: "demo-key" }, "password-reset-test");
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const originalFetch = globalThis.fetch;
  mock.module("../src/lib/firebase.ts", { namedExports: { auth, db: {} } });
  mock.module("../src/lib/user-profile.ts", { namedExports: { ensureOwnProfile: async () => ({}) } });
  globalThis.fetch = async (input, init) => typeof input === "string" && input.startsWith("/api/auth/")
    ? Response.json({ ok: true }) : originalFetch(input, init);
  try {
    const { resetAccountPassword } = await import("../src/lib/auth-service.ts");
    const email = `reset-${crypto.randomUUID()}@example.test`;
    await createUserWithEmailAndPassword(auth, email, "Old-password!123");
    await signOut(auth);
    for (const invalid of ["", "bad", "a b@example.test"]) {
      await assert.rejects(resetAccountPassword(invalid), { code: "auth/invalid-email" });
    }
    await resetAccountPassword(`  ${email.toUpperCase()}  `, "http://localhost:3117/login");
    const response = await originalFetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/oobCodes`);
    const { oobCodes } = await response.json();
    const reset = oobCodes.find((item: { email: string }) => item.email === email);
    assert.equal(reset.requestType, "PASSWORD_RESET");
    assert.equal(await verifyPasswordResetCode(auth, reset.oobCode), email);
    await confirmPasswordReset(auth, reset.oobCode, "New-password!456");
    await assert.rejects(signInWithEmailAndPassword(auth, email, "Old-password!123"));
    assert.equal((await signInWithEmailAndPassword(auth, email, "New-password!456")).user.email, email);
    await assert.rejects(confirmPasswordReset(auth, reset.oobCode, "Another-password!789"));
  } finally {
    globalThis.fetch = originalFetch;
    await signOut(auth);
    await deleteApp(app);
  }
});
