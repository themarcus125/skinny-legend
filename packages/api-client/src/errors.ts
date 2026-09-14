/** Mirrors the API error envelope `{ error: { code, message } }` (apps/api/src/errors.ts). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACK = 'errors.fallback';

/**
 * Maps an API failure to a message key under `errors.*`; the caller renders it with
 * `t(describeError(error))`. Nothing ever renders `error.message`: the API speaks English
 * (apps/api/src/errors.ts) and `push_failed` even forwards raw FCM text.
 *
 * Every code `apps/api/src/**` can emit is listed, member routes included — the admin
 * console simply never receives the member-only ones (`requireActive` guards the member
 * routes only, never `/auth/session` or `/admin/*`).
 */
const KEYS: Record<string, string> = {
  // Auth / authorisation
  unauthenticated: 'errors.unauthenticated',
  forbidden: 'errors.forbidden',
  pending_approval: 'errors.pending_approval',
  disabled: 'errors.disabled',
  // Generic
  invalid_body: 'errors.invalid_body',
  not_found: 'errors.not_found',
  internal: 'errors.internal',
  http_error: 'errors.internal',
  no_challenge: 'errors.no_challenge',
  // POST /entries
  photo_missing: 'errors.photo_missing',
  photo_invalid: 'errors.photo_invalid',
  taken_at_future: 'errors.taken_at_future',
  // Client-side: the presigned PUT to R2 failed (ruling R22). The API never emits this.
  upload_failed: 'errors.upload_failed',
  // POST /admin/notifications/test
  no_device_tokens: 'errors.no_device_tokens',
  push_failed: 'errors.push_failed',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return KEYS[error.code] ?? FALLBACK;
  // fetch() rejects with a TypeError when the request never completed: offline, DNS failure,
  // or a blocked CORS preflight.
  if (error instanceof TypeError) return 'errors.offline';
  return FALLBACK;
}
