import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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
function publicConfig(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Configuração pública obrigatória ausente: ${name}`);
  return value;
}

export const firebaseConfig = {
  apiKey: publicConfig("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: publicConfig("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: publicConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: publicConfig("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: publicConfig("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: publicConfig("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);
export default app;
