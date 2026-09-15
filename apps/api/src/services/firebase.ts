import { initializeApp, cert, getApp, getApps, type App } from 'firebase-admin/app';
import { env } from '../env.js';

/**
 * The one Firebase Admin app for this process. Token verification (middleware/auth.ts) and
 * FCM (services/push.ts) must share it: `initializeApp` throws on a duplicate default app.
 */
export function firebaseApp(): App {
  if (getApps().length === 0) {
    // With FIREBASE_AUTH_EMULATOR_HOST set, firebase-admin talks to the emulator and accepts
    // its unsigned tokens; a service account would be both unnecessary and unavailable.
    if (env.FIREBASE_AUTH_EMULATOR_HOST !== '') {
      return initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
    }
    return initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        // Railway stores the key with literal \n escapes.
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getApp();
}
