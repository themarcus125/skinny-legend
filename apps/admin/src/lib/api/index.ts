import { createApiClient, createMockApiClient, makeAdminSeed, type ApiClient, type TokenProvider } from '@skinny/api-client';

/** Local UI mode: seeded fixtures, no Firebase, no API. */
export const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === '1';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export function createAdminApi(getToken: TokenProvider): ApiClient {
  return IS_MOCK
    ? createMockApiClient({ seed: makeAdminSeed() })
    : createApiClient({ baseUrl: API_BASE_URL, getToken });
}

export type { ApiClient as AdminApi, TokenProvider };
export { ApiError, describeError } from '@skinny/api-client';
