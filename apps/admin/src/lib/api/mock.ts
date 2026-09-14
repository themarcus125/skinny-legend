import { MockApiClient, makeAdminSeed } from '@skinny/api-client';

/**
 * The shared in-memory client seeded with the admin console's fixture (`makeAdminSeed()` —
 * four members, thirty entries, the rulebook rows, feedback and notification logs). Both the
 * fixture and the behaviour moved into `@skinny/api-client` unchanged.
 */
export class MockAdminApi extends MockApiClient {
  constructor() {
    super({ seed: makeAdminSeed() });
  }
}
