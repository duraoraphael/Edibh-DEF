"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { writeAuditLog } from "./firestore-helpers";
import type { User } from "@/types";

interface AuthContextValue {
  user: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      if (!fbUser) {
        setProfile(null);
        setLoading(false);
      } else {
        updateDoc(doc(db, "users", fbUser.uid), { lastActive: serverTimestamp() }).catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...(snap.data() as Omit<User, "id">) });
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const check = await fetch("/api/auth/login-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (check && check.status === 429) {
      const retryAfter = check.headers.get("Retry-After");
      const err = new Error("rate-limited") as Error & { code: string };
      err.code = "auth/too-many-requests";
      throw retryAfter ? Object.assign(err, { retryAfter }) : err;
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    await updateDoc(doc(db, "users", credential.user.uid), {
      lastActive: serverTimestamp(),
    }).catch(() => {});
    try {
      const snap = await getDoc(doc(db, "users", credential.user.uid));
      const data = snap.exists() ? (snap.data() as Omit<User, "id">) : null;
      await writeAuditLog(
        {
          uid: credential.user.uid,
          name: data?.name || credential.user.email || undefined,
          role: data?.role,
        },
        { action: "Login" }
      );
    } catch {}
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, "users", credential.user.uid), {
      name,
      email,
      role: "visualizador",
      avatarUrl: "",
      department: "",
      lastActive: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await writeAuditLog(
          {
            uid: auth.currentUser.uid,
            name: profile?.name || auth.currentUser.email || undefined,
            role: profile?.role,
          },
          { action: "Logout" }
        );
      }
    } catch {}
    await firebaseSignOut(auth);
  }, [profile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signIn, signUp, resetPassword, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
