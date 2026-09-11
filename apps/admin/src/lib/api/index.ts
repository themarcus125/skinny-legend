import type { AdminApi } from './client';
import { LiveAdminApi, type TokenProvider } from './live';
import { MockAdminApi } from './mock';

/** Local UI mode: seeded fixtures, no Firebase, no API. */
export const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === '1';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export function createAdminApi(getToken: TokenProvider): AdminApi {
  return IS_MOCK ? new MockAdminApi() : new LiveAdminApi(API_BASE_URL, getToken);
}

export type { AdminApi, TokenProvider };
export { ApiError } from './client';
export { describeError } from './describe-error';
