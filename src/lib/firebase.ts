import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase client SDK config is not a secret by design (it's shipped in
// every browser bundle; access is governed by Firestore/Storage security
// rules and Firebase App Check, not by hiding these values) — but it must
// still come from env vars, never hardcoded, so a key rotation is a config
// change instead of a code change/redeploy and old values don't linger in
// git history.
//
// Each `process.env.NEXT_PUBLIC_*` reference below MUST stay a literal,
// static property access — Next.js inlines these into the client bundle at
// build time by pattern-matching that exact syntax. A helper that reads
// `process.env[name]` via a variable is NOT statically analyzable, so it
// silently defeats the inlining and every value ends up `undefined` in the
// browser (there is no real `process.env` at runtime on the client).
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (Object.values(firebaseConfig).some((v) => !v)) {
  throw new Error(
    "Missing Firebase env vars — set NEXT_PUBLIC_FIREBASE_* in .env.local (see .env.local.example) and in Vercel project settings."
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);
export default app;
