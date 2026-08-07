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
// runs both during Next.js's server-side prerendering AND in the browser.
// getAuth() validates the config eagerly and throws on a missing/malformed
// apiKey ("auth/invalid-api-key") — since NEXT_PUBLIC_* vars are inlined at
// BUILD time, a deployment built without them has that exact `undefined`
// baked into the browser bundle too, so gating the placeholder to
// "server-only" (as a previous version of this file did) still let the
// browser hit the same crash. The placeholder must apply unconditionally
// whenever the config is invalid, in both environments: real Firebase
// calls will still fail clearly at the point of use (e.g. clicking
// "Entrar"), but the app itself loads instead of crashing outright. Once
// real env vars are set (.env.local locally, Vercel project settings in
// production) and the app is rebuilt, this branch is never used.
// Every field gets a placeholder when invalid, not just apiKey — Firestore
// needs a real-looking projectId and Storage a real-looking storageBucket
// to construct without their own throws.
const sdkConfig: Required<typeof firebaseConfig> = {
  apiKey: firebaseConfig.apiKey || "build-placeholder-key",
  authDomain: firebaseConfig.authDomain || "build-placeholder.firebaseapp.com",
  projectId: firebaseConfig.projectId || "build-placeholder",
  storageBucket: firebaseConfig.storageBucket || "build-placeholder.appspot.com",
  messagingSenderId: firebaseConfig.messagingSenderId || "000000000000",
  appId: firebaseConfig.appId || "1:000000000000:web:0000000000000000000000",
};

const app = getApps().length ? getApp() : initializeApp(sdkConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);
export default app;
