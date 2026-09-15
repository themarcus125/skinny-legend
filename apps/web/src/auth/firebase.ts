import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Messaging } from 'firebase/messaging';
import {
  authEmulatorHost,
  firebaseOptions,
  hasFirebaseConfig as isConfigured,
} from './firebase-config';

export { hasFirebaseConfig, authEmulatorHost } from './firebase-config';

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
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

type AuthModule = typeof import('firebase/auth');

interface FirebaseSdk {
  app: FirebaseApp;
  auth: Auth;
  mod: AuthModule;
}

let sdk: Promise<FirebaseSdk> | null = null;

/**
 * Loads the Firebase SDK on first use and stands the app up.
 *
 * Both packages are reached through a dynamic `import()` so Rollup puts them in their own chunk:
 * `firebase/auth` alone is ~180 KB, and a mock session, a preview and the configuration-error
 * screen never touch it. `hasFirebaseConfig` lives in `firebase-config.ts` precisely so the
 * pre-paint check does not drag this module in.
 *
 * `initializeAuth` with `indexedDBLocalPersistence` rather than `getAuth`: a reload restores the
 * session from IndexedDB with no network round trip (and IndexedDB, unlike `localStorage`,
 * survives Safari's 7-day script-writable-storage eviction for an installed PWA). It also means
 * the popup/redirect resolver has to be passed explicitly — `getAuth` bundles one, this does not.
 *
 * The in-flight promise is memoised so concurrent callers share one load, but a **rejected** one
 * is not: an offline first paint would otherwise poison every later `signInWithGoogle()` and
 * `getIdToken()` until a full reload. The `sdk === pending` check means a retry that started
 * before the failure landed is not clobbered by the loser's cleanup.
 */
export function loadFirebase(): Promise<FirebaseSdk> {
  if (sdk) return sdk;
  const pending = (async (): Promise<FirebaseSdk> => {
    const [app, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const instance = app.getApps().length ? app.getApp() : app.initializeApp(firebaseOptions());
    const auth = mod.initializeAuth(instance, {
      persistence: mod.indexedDBLocalPersistence,
      popupRedirectResolver: mod.browserPopupRedirectResolver,
    });
    // The emulator is per-Auth-instance and `loadFirebase` memoises its promise, so this runs
    // exactly once per page load.
    if (authEmulatorHost !== '') {
      mod.connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
    }
    return { mod, app: instance, auth };
  })();
  sdk = pending;
  pending.catch(() => {
    if (sdk === pending) sdk = null;
  });
  return pending;
}

type MessagingModule = typeof import('firebase/messaging');

export interface MessagingSdk {
  messaging: Messaging;
  mod: MessagingModule;
}

let messagingSdk: Promise<MessagingSdk | null> | null = null;

/**
 * Loads `firebase/messaging` on first use, or resolves `null` when this browser cannot take web
 * push at all.
 *
 * Its own dynamic `import()`, for the same reason `firebase/auth` has one and then some: nothing
 * on the critical path needs it. Only the Account reminders row and the post-first-entry prompt
 * ever reach it, so the SDK must never appear in the entry chunk — a member who never turns
 * reminders on never downloads it.
 *
 * `isSupported()` is the SDK's own check (service worker, `PushManager`, IndexedDB, and the
 * webviews it knows are lying) and is asked *before* `getMessaging`, which throws outright on an
 * unsupported browser. A project with no `VITE_FIREBASE_*` — mock mode, a preview — resolves
 * `null` rather than standing an unconfigured app up.
 *
 * The in-flight promise is memoised, but a **rejected** one is not: a load that failed offline
 * must not poison the toggle until a full reload.
 */
export function loadMessaging(): Promise<MessagingSdk | null> {
  if (messagingSdk) return messagingSdk;
  const pending = (async (): Promise<MessagingSdk | null> => {
    if (!isConfigured) return null;
    const mod = await import('firebase/messaging');
    if (!(await mod.isSupported())) return null;
    const { app } = await loadFirebase();
    return { mod, messaging: mod.getMessaging(app) };
  })();
  messagingSdk = pending;
  pending.catch(() => {
    if (messagingSdk === pending) messagingSdk = null;
  });
  return pending;
}

/** The live port. Google is the only provider the web app offers (spec §3). */
export function firebaseAuthPort(): AuthPort {
  return {
    observe(listener) {
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      void loadFirebase().then(
        ({ auth, mod }) => {
          if (cancelled) return;
          unsubscribe = mod.onAuthStateChanged(auth, (user) => {
            listener(Boolean(user));
          });
        },
        (error: unknown) => {
          // A failed SDK load must not leave the app spinning forever: report "signed out" so
          // the sign-in screen renders and the member can retry.
          console.error('[auth] loading the Firebase SDK failed', error);
          if (!cancelled) listener(false);
        },
      );
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    async signInWithGoogle() {
      const { auth, mod } = await loadFirebase();
      try {
        await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
      } catch (error) {
        const code = errorCode(error);
        if (CANCELLED_CODES.has(code)) throw new Error(SIGN_IN_CANCELLED);
        if (POPUP_BLOCKED_CODES.has(code)) {
          // A blocked popup is the common case in an installed PWA and in Safari's Lockdown
          // Mode. The redirect never resolves — the page navigates away and comes back through
          // `observe` — so nothing after this line runs on the happy path.
          await mod.signInWithRedirect(auth, new mod.GoogleAuthProvider());
          return;
        }
        throw error;
      }
    },
    async signOut() {
      const { auth, mod } = await loadFirebase();
      await mod.signOut(auth);
    },
    async getIdToken() {
      const { auth, mod } = await loadFirebase();
      const user = auth.currentUser;
      return user ? await mod.getIdToken(user) : null;
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

/** Email/password sign-in against the Auth Emulator. Only the emulator-only form calls it. */
export async function signInWithEmulatorPassword(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadFirebase();
  await mod.signInWithEmailAndPassword(auth, email, password);
}
