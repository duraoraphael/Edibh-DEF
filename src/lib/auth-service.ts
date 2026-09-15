import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authError, normalizeEmail, postAuthGate } from "@/lib/auth-errors";
import { ensureOwnProfile } from "@/lib/user-profile";
import { withDeadline } from "@/lib/upload-policy";

async function step<T>(operation: string, work: () => Promise<T>): Promise<T> {
  try { return await withDeadline(work(), 25000); }
  catch (error) {
    console.error("auth.operation.failed", { operation, code: (error as { code?: string }).code || "unknown" });
    throw error;
  }
}

export async function signInAccount(email: string, password: string) {
  email = normalizeEmail(email);
  await postAuthGate("/api/auth/login-check", { email });
  const credential = await step("auth.signInWithEmailAndPassword", () => signInWithEmailAndPassword(auth, email, password));
  return step("firestore.users.ensureProfile", () => ensureOwnProfile(credential.user));
}

export async function signUpAccount(name: string, email: string, password: string) {
  name = name.trim();
  email = normalizeEmail(email);
  if (name.length < 2 || name.length > 120) throw authError("app/invalid-name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError("auth/invalid-email");
  if (password.length < 6) throw authError("auth/weak-password");
  await postAuthGate("/api/auth/abuse-check", { flow: "signup", email });
  const credential = await step("auth.createUserWithEmailAndPassword", () => createUserWithEmailAndPassword(auth, email, password));
  // Profile first: an optional display-name update must not strand the account.
  const profile = await step("firestore.users.createProfile", () => ensureOwnProfile(credential.user, name));
  await step("auth.updateDisplayName", () => updateProfile(credential.user, { displayName: name })).catch(() => {});
  return profile;
}

export async function recoverCurrentProfile() {
  if (!auth.currentUser) throw authError("auth/user-token-expired");
  return step("firestore.users.recoverProfile", () => ensureOwnProfile(auth.currentUser!));
}

export async function resetAccountPassword(email: string, returnUrl?: string) {
  email = normalizeEmail(email);
  try {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError("auth/invalid-email");
    await postAuthGate("/api/auth/abuse-check", { flow: "reset", email });
    // Await the SDK itself: releasing the UI lock on an artificial deadline
    // could allow another send while the original request is still running.
    await sendPasswordResetEmail(auth, email.trim().toLowerCase(), returnUrl ? { url: returnUrl } : undefined);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("auth.passwordReset.failed", { code: (error as { code?: string })?.code || "unknown" });
    }
    if (!["auth/user-not-found", "auth/user-disabled"].includes((error as { code?: string })?.code || "")) throw error;
  }
}
