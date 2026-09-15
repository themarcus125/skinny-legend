import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';

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

/**
 * Host:port of a Firebase Auth Emulator, e.g. "localhost:9099". Set only by the end-to-end
 * suite's build (docs/testing/e2e.md); empty in every deployed build, which is what keeps the
 * email/password form and `connectAuthEmulator` out of production.
 */
export const AUTH_EMULATOR_HOST: string = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '';

let emulatorConnected = false;

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
  const auth = getAuth(app);
  if (AUTH_EMULATOR_HOST !== '' && !emulatorConnected) {
    connectAuthEmulator(auth, `http://${AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    emulatorConnected = true;
  }
  return auth;
}

/** Google is the only provider the dashboard offers (spec §3). */
export function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

/** Email/password sign-in. Reachable only through the emulator-only form on the sign-in card. */
export async function signInWithEmulatorPassword(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email, password);
}
