import { ApiError } from './client';

const FALLBACK = 'errors.fallback';

/**
 * Maps an API failure to a message key under `errors.*` in messages/*.json; the caller renders it
 * with `t(describeError(error))`. Nothing ever renders `error.message`: the API speaks English
 * (apps/api/src/errors.ts) and `push_failed` even forwards raw FCM text. Only the codes the
 * dashboard can actually receive are listed — `pending_approval` is unreachable here because
 * `requireActive` guards the member routes only, never `/auth/session` or `/admin/*`.
 */
const KEYS: Record<string, string> = {
  unauthenticated: 'errors.unauthenticated',
  forbidden: 'errors.forbidden',
  disabled: 'errors.disabled',
  invalid_body: 'errors.invalid_body',
  not_found: 'errors.not_found',
  internal: 'errors.internal',
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
