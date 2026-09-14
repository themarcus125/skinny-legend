/**
 * `@skinny/api-client` — the single typed client for the Skinny Legend API, shared by the
 * admin console (`apps/admin`) and the member web app.
 *
 * The package ships TypeScript source, not `dist/`: both consumers (Next.js and Vite)
 * transpile workspace sources, which keeps `@skinny/shared`'s `dist/` the only build step.
 *
 * Nothing here may import `@skinny/shared`'s package root — that entry star-exports
 * `db/schema`, which drags drizzle into the browser bundle. `eslint.config.mjs` enforces it.
 */

export { ApiError, describeError } from './errors';
export {
  LiveApiClient,
  buildQuery,
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type TokenProvider,
} from './client';
export {
  MockApiClient,
  createMockApiClient,
  makeAdminSeed,
  makeSeed,
  svgImage,
  OSM_ATTRIBUTION,
  type MockApiClientOptions,
  type Seed,
  type SeedPlace,
} from './mock/client';
export * from './types';
