/**
 * The Firebase web config, and **nothing that imports the Firebase SDK**.
 *
 * `hasFirebaseConfig` is read before first paint — `SessionProvider` needs it to decide between
 * the mock, the live client and the configuration-error screen — so anything it lives beside is
 * statically reachable from `main.tsx`. Keeping it in its own module is what lets
 * `firebase.ts` reach `firebase/app` and `firebase/auth` through a dynamic `import()`, and
 * `firebase/auth` alone is ~180 KB that a mock session never needs.
 *
 * Vite inlines every `import.meta.env.VITE_*` member expression at build time, so this object is
 * a compile-time constant and `hasFirebaseConfig` folds to a literal in the bundle.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

/** True when all five `VITE_FIREBASE_*` variables are set. `AppMode.hasFirebasePlist`. */
export const hasFirebaseConfig = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId && config.messagingSenderId,
);

export interface FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
}

/** Throws rather than handing the SDK a half-filled config. Guarded by `hasFirebaseConfig`. */
export function firebaseOptions(): FirebaseOptions {
  if (!hasFirebaseConfig) throw new Error('Missing VITE_FIREBASE_* environment variables');
  return {
    apiKey: config.apiKey!,
    authDomain: config.authDomain!,
    projectId: config.projectId!,
    appId: config.appId!,
    messagingSenderId: config.messagingSenderId!,
  };
}
