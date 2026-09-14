import { LiveApiClient, type TokenProvider } from '@skinny/api-client';

export type { TokenProvider };

/**
 * The shared `LiveApiClient` under the admin's historical name and positional constructor.
 * The implementation — bearer token, envelope unwrapping, `ApiError` — is the package's.
 */
export class LiveAdminApi extends LiveApiClient {
  constructor(baseUrl: string, getToken: TokenProvider) {
    super({ baseUrl, getToken });
  }
}
