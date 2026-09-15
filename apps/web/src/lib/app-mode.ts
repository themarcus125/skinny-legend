/**
 * Whether this load talks to the real backend or to `@skinny/api-client/mock`.
 *
 * Port of `AppMode` (`ios/SkinnyLegend/App/AppMode.swift`). iOS settles the question with a
 * `-mockAPI` launch argument plus a DEBUG-only `UserDefaults` override flipped from the sign-in
 * screen; the web reads `VITE_MOCK` (inlined at build time) plus the same runtime override, kept
 * in `localStorage`.
 */
export type Services = 'live' | 'mock';

/**
 * Port of `AppMode.services`. Either mock signal wins, and a build with no Firebase config must
 * land on the mock rather than stand up `initializeAuth` against an unconfigured app and throw.
 *
 * Pure over its three inputs so it can be tested without `import.meta.env` or storage — exactly
 * why the Swift original takes its `ProcessInfo`/`Bundle`/`UserDefaults` reads as parameters.
 */
export function resolveServices({
  envIsMock,
  mockOverride,
  hasFirebaseConfig,
}: {
  envIsMock: boolean;
  mockOverride: boolean;
  hasFirebaseConfig: boolean;
}): Services {
  return !(envIsMock || mockOverride) && hasFirebaseConfig ? 'live' : 'mock';
}

/** Where the dev-only "Dùng dữ liệu mẫu" override is persisted. `AppMode.mockOverrideKey`. */
export const MOCK_OVERRIDE_KEY = 'skinny.mockOverride';

function safeStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  // Safari in private mode throws on `localStorage` access rather than returning null.
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The runtime override, off unless a dev build turned it on.
 *
 * Both halves are gated on `import.meta.env.DEV`, mirroring the `#if DEBUG` on *both* the getter
 * and the setter in Swift: the flag lives in `localStorage`, which survives a dev-to-production
 * deploy on the same origin, so a production build that still *read* it could boot straight into
 * the mock with no UI anywhere to turn it off (the "Dùng dữ liệu mẫu" control is itself
 * dev-only). With the read compiled out, `resolveServices` provably gets `false` in production.
 */
export function readMockOverride(storage?: Storage): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return safeStorage(storage)?.getItem(MOCK_OVERRIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMockOverride(value: boolean, storage?: Storage): void {
  if (!import.meta.env.DEV) return;
  try {
    const store = safeStorage(storage);
    if (value) store?.setItem(MOCK_OVERRIDE_KEY, '1');
    else store?.removeItem(MOCK_OVERRIDE_KEY);
  } catch {
    // A full or blocked quota must not take the sign-in screen down with it.
  }
}
