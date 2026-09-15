import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  getIdToken as firebaseGetIdToken,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';

/**
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

/**
 * The slice of Firebase Auth the session provider actually needs, as an interface, so
 * `session.test.tsx` can drive the whole state machine without a Firebase project — the same
 * role `AuthService`/`MockAuthService` play on iOS.
 */
export interface AuthPort {
  /** Fires once with the restored session, then on every change. Returns the unsubscribe. */
  observe(listener: (signedIn: boolean) => void): () => void;
  /** Resolves when a user is signed in; rejects with `SIGN_IN_CANCELLED` if they backed out. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** The ID token for the API client, or null when nobody is signed in. */
  getIdToken(): Promise<string | null>;
}

/** Thrown by `signInWithGoogle` when the member closed the popup; never surfaced as an error. */
export const SIGN_IN_CANCELLED = 'auth/cancelled';

const CANCELLED_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

/** Codes that mean "the popup never opened" — retry the whole flow as a full-page redirect. */
const POPUP_BLOCKED_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
}

let auth: Auth | null = null;

/**
 * Lazily stands up Firebase. Never called in mock mode, and never called at all when
 * `hasFirebaseConfig` is false — `SessionProvider` renders the configuration-error screen first.
 *
 * `initializeAuth` with `indexedDBLocalPersistence` rather than `getAuth`: a reload restores the
 * session from IndexedDB with no network round trip (and IndexedDB, unlike `localStorage`,
 * survives Safari's 7-day script-writable-storage eviction for an installed PWA). It also means
 * the popup/redirect resolver has to be passed explicitly — `getAuth` bundles one, this does not.
 */
export function firebaseAuth(): Auth {
  if (!hasFirebaseConfig) throw new Error('Missing VITE_FIREBASE_* environment variables');
  if (!auth) {
    const app: FirebaseApp = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: config.apiKey!,
          authDomain: config.authDomain!,
          projectId: config.projectId!,
          appId: config.appId!,
          messagingSenderId: config.messagingSenderId!,
        });
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return auth;
}

/** The live port. Google is the only provider the web app offers (spec §3). */
export function firebaseAuthPort(): AuthPort {
  return {
    observe(listener) {
      return onAuthStateChanged(firebaseAuth(), (user: User | null) => {
        listener(Boolean(user));
      });
    },
    async signInWithGoogle() {
      const instance = firebaseAuth();
      try {
        await signInWithPopup(instance, new GoogleAuthProvider());
      } catch (error) {
        const code = errorCode(error);
        if (CANCELLED_CODES.has(code)) throw new Error(SIGN_IN_CANCELLED);
        if (POPUP_BLOCKED_CODES.has(code)) {
          // A blocked popup is the common case in an installed PWA and in Safari's Lockdown
          // Mode. The redirect never resolves — the page navigates away and comes back through
          // `observe` — so nothing after this line runs on the happy path.
          await signInWithRedirect(instance, new GoogleAuthProvider());
          return;
        }
        throw error;
      }
    },
    signOut() {
      return signOut(firebaseAuth());
    },
    async getIdToken() {
      const user = firebaseAuth().currentUser;
      return user ? await firebaseGetIdToken(user) : null;
    },
  };
}

/**
 * Where mock mode remembers whether it is "signed in". Mock mode has no Firebase, but the gate
 * states still have to be reachable: the sign-in screen, and everything behind it.
 */
export const MOCK_SIGNED_IN_KEY = 'skinny.mock.signedIn';

/**
 * The mock port — `MockAuthService` on iOS. It starts signed in so `VITE_MOCK=1` previews and
 * the Playwright smoke boot straight into the shell; signing out (or seeding the key with `'0'`)
 * puts the sign-in screen back, and signing in is instantaneous.
 */
export function mockAuthPort(storage?: Storage): AuthPort {
  const store = (): Storage | undefined => {
    if (storage) return storage;
    try {
      return typeof localStorage === 'undefined' ? undefined : localStorage;
    } catch {
      return undefined;
    }
  };
  const read = (): boolean => {
    try {
      return store()?.getItem(MOCK_SIGNED_IN_KEY) !== '0';
    } catch {
      return true;
    }
  };
  const write = (value: boolean): void => {
    try {
      store()?.setItem(MOCK_SIGNED_IN_KEY, value ? '1' : '0');
    } catch {
      // A blocked store just means the mock forgets across reloads.
    }
  };

  let listeners: ((signedIn: boolean) => void)[] = [];
  const emit = (): void => {
    const signedIn = read();
    for (const listener of listeners) listener(signedIn);
  };

  return {
    observe(listener) {
      listeners.push(listener);
      listener(read());
      return () => {
        listeners = listeners.filter((entry) => entry !== listener);
      };
    },
    signInWithGoogle() {
      write(true);
      emit();
      return Promise.resolve();
    },
    signOut() {
      write(false);
      emit();
      return Promise.resolve();
    },
    getIdToken() {
      return Promise.resolve(read() ? 'mock-token' : null);
    },
  };
}
