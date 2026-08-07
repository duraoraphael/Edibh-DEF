import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase client SDK config is not a secret (it's shipped in every browser
// bundle either way; access is governed by Firestore/Storage security rules,
// not by hiding these values — see firestore.rules / storage.rules). env
// vars still take priority when set (so a key rotation on Vercel doesn't
// need a code change), but each field also has a literal fallback so the
// app works out of the box even when NEXT_PUBLIC_FIREBASE_* isn't set on
// the deploying platform.
//
// Each `process.env.NEXT_PUBLIC_*` reference below MUST stay a literal,
// static property access — Next.js inlines these into the client bundle at
// build time by pattern-matching that exact syntax. A helper that reads
// `process.env[name]` via a variable is NOT statically analyzable, so it
// silently defeats the inlining and every value ends up `undefined` in the
// browser (there is no real `process.env` at runtime on the client).
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyC6-C2vmhSuiprgc5A_2jConYF6Pa_qDZQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "cim-normatel-ac5b7.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "cim-normatel-ac5b7",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "cim-normatel-ac5b7.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "612881372973",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:612881372973:web:784ed324cefe5d2d7ea5a4",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);
export default app;
