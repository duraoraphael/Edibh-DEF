"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { signInAccount, signUpAccount, recoverCurrentProfile, resetAccountPassword } from "./auth-service";
import { withDeadline } from "./upload-policy";
import { writeAuditLog } from "./firestore-helpers";
import type { User } from "@/types";
import { normalizeUserProfile } from "@/lib/access-policy";

interface AuthContextValue {
  user: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  recoverProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
  recoverProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setProfile(null);
      setLoading(!!fbUser);
      setUser(fbUser);
      if (!fbUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      console.error("auth.profile.failed", { operation: "users.subscribe", code: "app/deadline-exceeded" });
      setLoading(false);
    }, 25000);
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        clearTimeout(timer);
        if (auth.currentUser?.uid !== user.uid) return;
        if (snap.exists()) {
          setProfile(normalizeUserProfile(snap.data() as Partial<User>, snap.id, user.email, user.displayName));
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
      (error) => {
        clearTimeout(timer);
        if (auth.currentUser?.uid !== user.uid) return;
        setProfile(null);
        console.error("auth.profile.failed", { operation: "users.subscribe", code: error.code });
        setLoading(false);
      }
    );
    return () => { clearTimeout(timer); unsub(); };
  }, [user]);

  const runAccountAction = useCallback(async (work: () => Promise<User>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try { setProfile(await work()); }
    finally { actionLock.current = false; setBusy(false); setLoading(false); }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await runAccountAction(async () => {
      const data = await signInAccount(email, password);
      void withDeadline(writeAuditLog({ uid: data.id, name: data.name, role: data.role }, { action: "Login" }), 5000)
        .catch(error => console.error("auth.audit.failed", { code: error?.code || "unknown" }));
      return data;
    });
  }, [runAccountAction]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await runAccountAction(() => signUpAccount(name, email, password));
  }, [runAccountAction]);

  const recoverProfile = useCallback(async () => {
    await runAccountAction(recoverCurrentProfile);
  }, [runAccountAction]);

  const resetPassword = useCallback(async (email: string) => {
    await resetAccountPassword(email, new URL("/login", window.location.origin).href);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await withDeadline(writeAuditLog(
          {
            uid: auth.currentUser.uid,
            name: profile?.name || auth.currentUser.email || undefined,
            role: profile?.role,
          },
          { action: "Logout" }
        ), 5000);
      }
    } catch {}
    await firebaseSignOut(auth);
  }, [profile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading: loading || busy, signIn, signUp, resetPassword, signOut, recoverProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
