import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { testSendErrorKey } from './test-send-error';

describe('testSendErrorKey', () => {
  it('maps the two codes only the test-send route returns', () => {
    expect(testSendErrorKey(new ApiError(400, 'no_device_tokens', 'User has no registered devices'))).toBe(
      'noDeviceTokens',
    );
    expect(
      testSendErrorKey(new ApiError(502, 'push_failed', 'Push delivery failed: FCM 503 UNAVAILABLE')),
    ).toBe('pushFailed');
  });

  it('leaves every other error to describeError', () => {
    expect(testSendErrorKey(new ApiError(404, 'not_found', 'User not found'))).toBeNull();
    expect(testSendErrorKey(new TypeError('Failed to fetch'))).toBeNull();
    expect(testSendErrorKey(null)).toBeNull();
  });
});
