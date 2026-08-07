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

const configIsValid = Object.values(firebaseConfig).every(Boolean);
if (!configIsValid) {
  console.error(
    "Missing Firebase env vars — set NEXT_PUBLIC_FIREBASE_* in .env.local (see .env.local.example) and in Vercel project settings."
  );
}

// This module is imported (via AuthProvider) from the root layout, so it
// runs during Next.js's static prerendering on the server for every page —
// including ones that never touch Firebase. getAuth() validates the config
// eagerly and throws on a missing/malformed apiKey, which previously took
// down the ENTIRE build the moment the project's env vars weren't set yet.
// Nothing server-rendered actually calls Firebase (all real usage happens
// inside client-only effects/handlers), so only the browser needs a real,
// valid config; on the server without one, swap in a syntactically-valid
// placeholder just so SDK construction doesn't throw. Once real env vars
// are set (in .env.local and in Vercel), this branch is never used.
const sdkConfig =
  configIsValid || typeof window !== "undefined"
    ? firebaseConfig
    : { ...firebaseConfig, apiKey: "build-placeholder-key" };

const app = getApps().length ? getApp() : initializeApp(sdkConfig as typeof firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);
export default app;
