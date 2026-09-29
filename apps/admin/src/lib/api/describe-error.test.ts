import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { describeError } from './describe-error';

describe('describeError', () => {
  it('maps every code the dashboard can receive to its errors.* key', () => {
    expect(describeError(new ApiError(401, 'unauthenticated', 'Missing token'))).toBe('errors.unauthenticated');
    expect(describeError(new ApiError(403, 'forbidden', 'Admin only'))).toBe('errors.forbidden');
    expect(describeError(new ApiError(403, 'disabled', 'Account disabled'))).toBe('errors.disabled');
    expect(describeError(new ApiError(400, 'invalid_body', 'Invalid input'))).toBe('errors.invalid_body');
    expect(describeError(new ApiError(404, 'not_found', 'Entry not found'))).toBe('errors.not_found');
    expect(describeError(new ApiError(500, 'internal', 'Internal error'))).toBe('errors.internal');
  });

  it('maps the two codes only POST /admin/notifications/test returns', () => {
    expect(describeError(new ApiError(400, 'no_device_tokens', 'User has no registered devices'))).toBe(
      'errors.no_device_tokens',
    );
    // The message carries raw FCM text; only the code is ever looked at.
    expect(describeError(new ApiError(502, 'push_failed', 'Push delivery failed: FCM 503 UNAVAILABLE'))).toBe(
      'errors.push_failed',
    );
  });

  it('maps the codes adding an entry with a photo can return', () => {
    expect(describeError(new ApiError(400, 'taken_at_future', 'takenAt is in the future'))).toBe('errors.taken_at_future');
    expect(describeError(new ApiError(400, 'photo_missing', 'Photo not uploaded'))).toBe('errors.photo_missing');
    expect(describeError(new ApiError(400, 'photo_invalid', 'Photo could not be decoded'))).toBe('errors.photo_invalid');
    expect(describeError(new ApiError(0, 'upload_failed', 'PUT failed'))).toBe('errors.upload_failed');
  });

  it('has Vietnamese and English copy for every key it can answer with', async () => {
    const vi = (await import('../../../messages/vi.json')).default as { errors: Record<string, string> };
    const en = (await import('../../../messages/en.json')).default as { errors: Record<string, string> };
    for (const code of ['taken_at_future', 'photo_missing', 'photo_invalid', 'upload_failed']) {
      expect(vi.errors[code], `vi errors.${code}`).toEqual(expect.any(String));
      expect(en.errors[code], `en errors.${code}`).toEqual(expect.any(String));
    }
  });

  it('describes a network / CORS failure', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('errors.offline');
  });

  it('never leaks the English server message for an unknown code', () => {
    const key = describeError(new ApiError(418, 'teapot', 'I am a teapot'));
    expect(key).toBe('errors.fallback');
    expect(key).not.toContain('teapot');
  });

  it('falls back for anything that is not an Error', () => {
    expect(describeError(null)).toBe('errors.fallback');
    expect(describeError('boom')).toBe('errors.fallback');
  });
});
