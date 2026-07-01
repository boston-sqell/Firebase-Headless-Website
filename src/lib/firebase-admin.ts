/**
 * Single shared Firebase Admin SDK singleton.
 *
 * Every server-side module (cms.ts, admin-data.ts, admin-auth.ts, API routes)
 * imports getDb() / getAdminAuth() / getAdminStorage() from here instead of
 * calling initializeApp() itself. This guarantees exactly one Admin app
 * instance per process, regardless of import order.
 *
 * Credentials:
 *   Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in
 *   .env.local (from a service account JSON), OR set
 *   GOOGLE_APPLICATION_CREDENTIALS / rely on Application Default Credentials
 *   (this is what Cloud Run uses automatically via its runtime service
 *   account -- no key material needed in production, see README).
 *
 *   FIREBASE_STORAGE_BUCKET is optional; defaults to
 *   "<project-id>.appspot.com". Check Project Settings -> Storage in the
 *   Firebase Console for your actual bucket name if uploads fail.
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

let _app: App | undefined;

function readEnv(key: string): string | undefined {
  return (import.meta as any).env?.[key] || process.env[key];
}

function getAdminApp(): App {
  if (_app) return _app;

  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }

  const projectId = readEnv("FIREBASE_PROJECT_ID");
  const clientEmail = readEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = (readEnv("FIREBASE_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
  const storageBucket = readEnv("FIREBASE_STORAGE_BUCKET") || (projectId ? `${projectId}.appspot.com` : undefined);

  if (projectId && clientEmail && privateKey) {
    _app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
  } else {
    _app = initializeApp({ storageBucket });
  }

  return _app;
}

export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}
