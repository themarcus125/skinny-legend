import { describe, it, expect } from 'vitest';
import { ApiError, describeError } from '../src/index';

describe('describeError', () => {
  it.each([
    ['unauthenticated', 'errors.unauthenticated'],
    ['forbidden', 'errors.forbidden'],
    ['pending_approval', 'errors.pending_approval'],
    ['disabled', 'errors.disabled'],
    ['invalid_body', 'errors.invalid_body'],
    ['not_found', 'errors.not_found'],
    ['photo_missing', 'errors.photo_missing'],
    ['photo_invalid', 'errors.photo_invalid'],
    ['taken_at_future', 'errors.taken_at_future'],
    ['upload_failed', 'errors.upload_failed'],
    ['no_device_tokens', 'errors.no_device_tokens'],
    ['push_failed', 'errors.push_failed'],
    ['internal', 'errors.internal'],
    ['no_challenge', 'errors.no_challenge'],
    // Hono's HTTPException envelope: a protocol-level failure the member sees as a server error.
    ['http_error', 'errors.internal'],
  ])('maps %s to %s', (code, key) => {
    expect(describeError(new ApiError(400, code, 'x'))).toBe(key);
  });

  it('maps a failed fetch to the offline key', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('errors.offline');
  });

  it('falls back for anything else', () => {
    expect(describeError(new Error('boom'))).toBe('errors.fallback');
    expect(describeError(new ApiError(500, 'weird_new_code', 'x'))).toBe('errors.fallback');
    expect(describeError(null)).toBe('errors.fallback');
    expect(describeError('boom')).toBe('errors.fallback');
  });

  it('never leaks the English server message', () => {
    expect(describeError(new ApiError(418, 'teapot', 'I am a teapot'))).not.toContain('teapot');
  });
});
