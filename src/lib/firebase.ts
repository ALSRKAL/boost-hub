import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// ============================================================
// Firebase Configuration (from environment variables)
// ============================================================

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

/**
 * Firebase is considered configured when both apiKey and projectId
 * are non-empty strings (not just truthy — empty string is falsy).
 */
export const isFirebaseConfigured: boolean =
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey.length > 0 &&
  typeof firebaseConfig.projectId === "string" &&
  firebaseConfig.projectId.length > 0;

// ============================================================
// Singleton Instances
// ============================================================

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

/**
 * Returns the singleton FirebaseApp.
 * Initializes it lazily on first call, re-uses on subsequent calls.
 */
export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.local.example to .env.local and fill in your Firebase credentials."
    );
  }

  _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

/**
 * Returns the singleton Firebase Auth instance.
 */
export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

/**
 * Returns the singleton Firestore instance.
 * This is the value you pass into `doc()`, `collection()`, etc.
 */
export function getFirebaseDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  return _db;
}
