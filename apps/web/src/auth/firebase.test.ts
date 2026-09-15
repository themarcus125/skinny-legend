import { describe, expect, it, vi } from 'vitest';

/**
 * The first `initializeApp` throws, standing in for the real failure this guards: a dynamic
 * `import('firebase/app')` that never resolves because the browser was offline at first paint.
 */
const state = vi.hoisted(() => ({ failNext: true, apps: 0 }));

vi.mock('./firebase-config', () => ({
  hasFirebaseConfig: true,
  firebaseOptions: () => ({
    apiKey: 'k',
    authDomain: 'd',
    projectId: 'p',
    appId: 'a',
    messagingSenderId: 's',
  }),
}));

vi.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: () => ({ name: 'app' }),
  initializeApp: () => {
    if (state.failNext) {
      state.failNext = false;
      throw new Error('offline');
    }
    state.apps += 1;
    return { name: 'app' };
  },
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: () => ({ currentUser: null }),
  indexedDBLocalPersistence: {},
  browserPopupRedirectResolver: {},
  onAuthStateChanged: () => () => undefined,
  signInWithPopup: () => Promise.resolve(),
  signInWithRedirect: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  getIdToken: () => Promise.resolve('token'),
  GoogleAuthProvider: class {},
}));

const { loadFirebase } = await import('./firebase');

describe('loadFirebase', () => {
  it('does not memoise a rejected load, so the next call retries', async () => {
    await expect(loadFirebase()).rejects.toThrow('offline');

    // Without clearing the memo this second call would replay the same rejection forever, and
    // every later signInWithGoogle()/getIdToken() with it, until a full page reload.
    const sdk = await loadFirebase();
    expect(sdk.auth).toBeDefined();
    expect(state.apps).toBe(1);
  });

  it('memoises the successful load', async () => {
    const [first, second] = await Promise.all([loadFirebase(), loadFirebase()]);
    expect(first).toBe(second);
    expect(state.apps).toBe(1);
  });
});
