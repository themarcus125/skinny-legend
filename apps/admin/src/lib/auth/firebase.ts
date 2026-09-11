import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when all four NEXT_PUBLIC_FIREBASE_* variables are set. */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;

/** Lazily initialises the Firebase app. Never called in mock mode. */
export function firebaseAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error('Thiếu biến môi trường NEXT_PUBLIC_FIREBASE_*');
  }
  if (!app) {
    app = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: config.apiKey!,
          authDomain: config.authDomain!,
          projectId: config.projectId!,
          appId: config.appId!,
        });
  }
  return getAuth(app);
}

/** Google is the only provider the dashboard offers (spec §3). */
export function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}
