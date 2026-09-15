import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiClient } from '@skinny/api-client';
import { hasFirebaseConfig } from '@/auth/firebase-config';
import { readMockOverride, resolveServices, type Services } from './app-mode';
import { ApiError, createLiveApiClient, describeError } from './live-client';

/**
 * Mock mode (`VITE_MOCK=1`) swaps the live client for the shared in-memory one — the same seed
 * the iOS previews and the admin use. It is the default for Playwright and Pages previews.
 *
 * This constant is for reading (tests, UI badges) only. Every *branch that guards the mock
 * import* must compare `import.meta.env.VITE_MOCK` inline: Vite inlines that member expression,
 * so Rollup folds the comparison to `false` and drops the `import()` — and with it the 42.8 KB
 * seed chunk — out of a production build entirely. Going through this re-exported binding
 * instead defeats the elimination and ships the seed to every member.
 */
export const IS_MOCK = import.meta.env.VITE_MOCK === '1';

/**
 * The whole mode decision for this load, through the `AppMode.services` port — env flag, the
 * dev-only "Dùng dữ liệu mẫu" override, and whether Firebase is configured at all.
 *
 * Read it for UI ("you are on sample data"); do **not** use it to guard the mock `import()`.
 * See `IS_MOCK` above and the inlined branches below.
 */
export function currentServices(): Services {
  return resolveServices({
    envIsMock: import.meta.env.VITE_MOCK === '1',
    mockOverride: import.meta.env.DEV && readMockOverride(),
    hasFirebaseConfig,
  });
}

/*
 * The guard the mock `import()` hangs off is spelled out **inline at both call sites below**,
 * never extracted into a binding or a helper — Rollup only folds the literal comparison it can
 * see in the branch itself (Task 5 review, C1). The shape is:
 *
 *   import.meta.env.VITE_MOCK === '1' ||
 *   (import.meta.env.DEV && (readMockOverride() || !hasFirebaseConfig))
 *
 * In a production build `import.meta.env.DEV` inlines to `false`, so the whole parenthesised
 * half collapses and only the `VITE_MOCK` literal survives — a production bundle with no
 * `VITE_MOCK` still drops the seed chunk entirely. Both dev-only reasons to run the mock (the
 * override, and a dev server with no Firebase project) sit inside that half deliberately:
 * production with no Firebase config gets the configuration-error screen from `SessionProvider`,
 * never a silent boot into somebody else's sample data.
 */

const ApiContext = createContext<ApiClient | null>(null);

export { ApiError, createLiveApiClient, describeError };

/**
 * True only in a build that will reach for the **live** client but has no Firebase project
 * configured: `SessionProvider` renders a configuration-error screen instead of standing
 * `initializeAuth` up against an unconfigured app and throwing on first paint.
 *
 * Deliberately narrower than `resolveServices`, which answers "mock" for the same inputs
 * (`AppMode` parity): a *dev* server with no Firebase project is a perfectly good sample-data
 * session, while a production deploy with no Firebase project is a deployment mistake that must
 * be visible rather than silently serving somebody else's seed data.
 */
export function isFirebaseMisconfigured(): boolean {
  return !hasFirebaseConfig && !import.meta.env.DEV && import.meta.env.VITE_MOCK !== '1';
}

/**
 * Provides the one `ApiClient` the app talks to.
 *
 * The mock is reached through a dynamic `import('@skinny/api-client/mock')` — never the package
 * root, which re-exports it (Task 2 review) — behind an inlined env literal, so a production
 * bundle leaves the seed behind entirely. `client` is injectable for tests.
 */
export function ApiProvider({ children, client }: { children: ReactNode; client?: ApiClient }) {
  const [resolved, setResolved] = useState<ApiClient | null>(
    () =>
      client ??
      (import.meta.env.VITE_MOCK === '1' ||
      (import.meta.env.DEV && (readMockOverride() || !hasFirebaseConfig))
        ? null
        : createLiveApiClient()),
  );

  useEffect(() => {
    if (resolved) return;
    let alive = true;
    // Positive, literal-compared branch: `if (false) { … }` is what Rollup drops outright.
    if (
      import.meta.env.VITE_MOCK === '1' ||
      (import.meta.env.DEV && (readMockOverride() || !hasFirebaseConfig))
    ) {
      void import('@skinny/api-client/mock').then(({ createMockApiClient, makeSeed }) => {
        if (alive) setResolved(createMockApiClient({ seed: makeSeed() }));
      });
    }
    return () => {
      alive = false;
    };
  }, [resolved]);

  if (!resolved) return null;
  return <ApiContext.Provider value={resolved}>{children}</ApiContext.Provider>;
}

/** The API client for the current mode. Throws outside `<ApiProvider>` rather than guessing. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>.');
  return client;
}
