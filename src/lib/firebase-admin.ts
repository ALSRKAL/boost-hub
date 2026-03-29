import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

// ============================================================
// Singleton Firebase Admin — survives Next.js hot-reloads
// ============================================================

let _adminApp: App | null = null;
let _adminAuth: Auth | null = null;
let _adminDb: Firestore | null = null;
let _adminMessaging: Messaging | null = null;

function getFirebaseAdminApp(): App {
  if (_adminApp) return _adminApp;

  // If an app already exists (e.g. from a previous hot-reload),
  // re-use it instead of trying to create a duplicate.
  if (getApps().length > 0) {
    _adminApp = getApps()[0];
    return _adminApp;
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (projectId && clientEmail && privateKey) {
    _adminApp = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    return _adminApp;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    _adminApp = initializeApp({
      credential: applicationDefault(),
      projectId,
    });
    return _adminApp;
  }

  throw new Error(
    "Firebase Admin is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
  );
}

export function getAdminAuth(): Auth {
  if (_adminAuth) return _adminAuth;
  _adminAuth = getAuth(getFirebaseAdminApp());
  return _adminAuth;
}

export function getAdminDb(): Firestore {
  if (_adminDb) return _adminDb;
  _adminDb = getFirestore(getFirebaseAdminApp());
  return _adminDb;
}

export function getAdminMessaging(): Messaging {
  if (_adminMessaging) return _adminMessaging;
  _adminMessaging = getMessaging(getFirebaseAdminApp());
  return _adminMessaging;
}
