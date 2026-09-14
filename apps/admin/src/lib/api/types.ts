/**
 * The admin console's DTOs now live in `@skinny/api-client` (shared with the member web app).
 * This module stays as the import path every component already uses — `@/lib/api/types` —
 * and re-exports them unchanged, so no component changed when the types moved.
 */
export * from '@skinny/api-client';
