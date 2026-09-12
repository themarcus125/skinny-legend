import { ApiError } from '@/lib/api/client';

/** Suffixes under `notifications.errors.*` in messages/*.json. */
export type TestSendErrorKey = 'noDeviceTokens' | 'pushFailed';

const CODES: Record<string, TestSendErrorKey> = {
  no_device_tokens: 'noDeviceTokens',
  push_failed: 'pushFailed',
};

/**
 * The two codes specific to `POST /admin/notifications/test`. Everything else falls through to
 * `describeError`. `push_failed` carries the raw FCM error text in `message`; it must never be
 * rendered, so the caller shows the generic catalogue string instead.
 */
export function testSendErrorKey(error: unknown): TestSendErrorKey | null {
  return error instanceof ApiError ? (CODES[error.code] ?? null) : null;
}
