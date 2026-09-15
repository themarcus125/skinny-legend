// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- see below; this is the one allowed root import.
import { createApiClient, type ApiClient, type TokenProvider } from '@skinny/api-client';
import { firebaseAuthPort } from '@/auth/firebase';

/** Resolved per call, so a token that expired mid-session is refreshed by the SDK, not replayed. */
const defaultTokenProvider: TokenProvider = () => firebaseAuthPort().getIdToken();

/**
 * `ApiError` and `describeError` are values, not types, so they cannot be taken from the banned
 * package root anywhere else. They live in `src/errors.ts` upstream and pull nothing in with
 * them, so re-exporting them from this one allowed module keeps the ban absolute.
 */
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- the one allowed root import, see above.
export { ApiError, describeError } from '@skinny/api-client';

/**
 * The live client, in its own module.
 *
 * `@skinny/api-client`'s package root re-exports the mock and its fixtures, so the root is
 * off-limits everywhere else (`eslint.config.mjs`). Keeping the single value import here means
 * exactly one file has to be checked when the seed turns up in a production chunk again.
 *
 * `getToken` is the Firebase ID token of whoever is signed in, resolved per request so a token
 * that expired mid-session is refreshed rather than replayed. Nobody signed in returns null,
 * which the API answers with `unauthenticated` — an honest failure rather than a silent
 * unauthorised call.
 */
export function createLiveApiClient(getToken: TokenProvider = defaultTokenProvider): ApiClient {
  return createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getToken,
    headers: (): Record<string, string> => {
      // Ruling R17: only a dev build may impersonate, and only when the API runs AUTH_MODE=test.
      const uid = import.meta.env.VITE_TEST_UID;
      return import.meta.env.DEV && uid ? { 'x-test-uid': uid } : {};
    },
  });
}
