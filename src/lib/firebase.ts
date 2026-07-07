import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyC6-C2vmhSuiprgc5A_2jConYF6Pa_qDZQ",
  authDomain: "cim-normatel-ac5b7.firebaseapp.com",
  projectId: "cim-normatel-ac5b7",
  storageBucket: "cim-normatel-ac5b7.firebasestorage.app",
  messagingSenderId: "612881372973",
  appId: "1:612881372973:web:784ed324cefe5d2d7ea5a4",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
