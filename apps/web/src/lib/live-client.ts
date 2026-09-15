// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- see below; this is the one allowed root import.
import { createApiClient, type ApiClient } from '@skinny/api-client';

/**
 * The live client, in its own module.
 *
 * `@skinny/api-client`'s package root re-exports the mock and its fixtures, so the root is
 * off-limits everywhere else (`eslint.config.mjs`). Keeping the single value import here means
 * exactly one file has to be checked when the seed turns up in a production chunk again.
 *
 * Task 6 replaces `getToken` with the Firebase ID token; until then it returns null, which the
 * API answers with `unauthenticated` — an honest failure rather than a silent unauthorised call.
 */
export function createLiveApiClient(): ApiClient {
  return createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    // `() => Promise.resolve(null)`, not `async () => null`: nothing is awaited yet (Task 6
    // swaps in the Firebase ID token), and an async body with no await is a lint error.
    getToken: () => Promise.resolve(null),
    headers: (): Record<string, string> => {
      // Ruling R17: only a dev build may impersonate, and only when the API runs AUTH_MODE=test.
      const uid = import.meta.env.VITE_TEST_UID;
      return import.meta.env.DEV && uid ? { 'x-test-uid': uid } : {};
    },
  });
}
