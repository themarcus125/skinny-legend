import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type ApiClient } from '@skinny/api-client';

/**
 * Mock mode (`VITE_MOCK=1`) swaps the live client for the shared in-memory one — the same seed
 * the iOS previews and the admin use. It is the default for Playwright and Pages previews.
 */
export const IS_MOCK = import.meta.env.VITE_MOCK === '1';

const ApiContext = createContext<ApiClient | null>(null);

/**
 * The live client. Task 6 replaces `getToken` with the Firebase ID token; until then it returns
 * null, which the API answers with `unauthenticated` — an honest failure rather than a silent
 * unauthorised call.
 */
export function createLiveApiClient(): ApiClient {
  return createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getToken: async () => null,
    headers: (): Record<string, string> => {
      // Ruling R17: only a dev build may impersonate, and only when the API runs AUTH_MODE=test.
      const uid = import.meta.env.VITE_TEST_UID;
      return import.meta.env.DEV && uid ? { 'x-test-uid': uid } : {};
    },
  });
}

/**
 * Provides the one `ApiClient` the app talks to.
 *
 * The mock is reached through a dynamic `import('@skinny/api-client/mock')` — never the package
 * root, which re-exports it (Task 2 review) — so a production bundle leaves the seed behind
 * entirely. `client` is injectable for tests.
 */
export function ApiProvider({ children, client }: { children: ReactNode; client?: ApiClient }) {
  const [resolved, setResolved] = useState<ApiClient | null>(
    () => client ?? (IS_MOCK ? null : createLiveApiClient()),
  );

  useEffect(() => {
    if (resolved) return;
    let alive = true;
    void import('@skinny/api-client/mock').then(({ createMockApiClient, makeSeed }) => {
      if (alive) setResolved(createMockApiClient({ seed: makeSeed() }));
    });
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
