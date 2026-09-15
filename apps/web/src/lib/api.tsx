import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiClient } from '@skinny/api-client';
import { createLiveApiClient } from './live-client';

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

const ApiContext = createContext<ApiClient | null>(null);

export { createLiveApiClient };

/**
 * Provides the one `ApiClient` the app talks to.
 *
 * The mock is reached through a dynamic `import('@skinny/api-client/mock')` — never the package
 * root, which re-exports it (Task 2 review) — behind an inlined env literal, so a production
 * bundle leaves the seed behind entirely. `client` is injectable for tests.
 */
export function ApiProvider({ children, client }: { children: ReactNode; client?: ApiClient }) {
  const [resolved, setResolved] = useState<ApiClient | null>(
    () => client ?? (import.meta.env.VITE_MOCK === '1' ? null : createLiveApiClient()),
  );

  useEffect(() => {
    if (resolved) return;
    let alive = true;
    // Positive, literal-compared branch: `if (false) { … }` is what Rollup drops outright.
    if (import.meta.env.VITE_MOCK === '1') {
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
