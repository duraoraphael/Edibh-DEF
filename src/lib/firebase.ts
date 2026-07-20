import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase client SDK config is not a secret (protected by Firestore/Storage
// security rules, not by hiding these values) but is read from env vars when
// provided so deployments can rotate/override without a code change.
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
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
