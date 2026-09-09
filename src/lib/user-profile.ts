import type { User as FirebaseUser } from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authError, normalizeEmail } from "@/lib/auth-errors";
import type { User } from "@/types";
import { isUsableProfile } from "@/lib/access-policy";

export function initialUserProfile(uid: string, name: string, email: string) {
  return {
    uid, name: name.trim(), email: normalizeEmail(email), role: "visualizador" as const,
    status: "pendente" as const, approved: false, avatarUrl: "", department: "",
    createdAt: serverTimestamp(), lastActive: serverTimestamp(),
  };
}

/** Create only a missing own profile. Never overwrite existing roles/approval. */
export async function ensureOwnProfile(user: FirebaseUser, name?: string): Promise<User> {
  if (auth.currentUser?.uid !== user.uid || !user.email) throw authError("auth/user-token-expired");
  const ref = doc(db, "users", user.uid);
  const data = await runTransaction(db, async tx => {
    const current = await tx.get(ref);
    if (current.exists()) return current.data();
    const profile = initialUserProfile(user.uid, name?.trim() || user.displayName || "Usuário", user.email!);
    tx.set(ref, profile);
    return profile;
  });
  const profile = { ...data, id: user.uid } as User;
  if (!isUsableProfile(profile, user.uid, user.email)) {
    throw authError("app/profile-incomplete");
  }
  return profile;
}
