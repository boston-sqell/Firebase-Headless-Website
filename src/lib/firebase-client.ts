/**
 * Browser-side Firebase config -- used ONLY by the admin login page to call
 * Firebase Auth's signInWithEmailAndPassword. This is the one place in the
 * app that ships Firebase config to the browser.
 *
 * This is safe to expose: Firebase Web API keys are not secrets -- they
 * identify which Firebase project a request belongs to, and access is
 * actually gated by Firebase Auth itself plus (for Firestore/Storage)
 * Security Rules. Nothing else in this app talks to Firestore/Storage from
 * the browser -- all data access after login goes through server-side API
 * routes.
 *
 * Requires PUBLIC_FIREBASE_API_KEY / PUBLIC_FIREBASE_AUTH_DOMAIN /
 * PUBLIC_FIREBASE_PROJECT_ID in .env.local -- see .env.example.
 */

import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
