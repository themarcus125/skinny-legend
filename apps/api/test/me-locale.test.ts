import { describe, it, expect, beforeEach } from 'vitest';
import { app, resetDb, asUser } from './helpers.js';

beforeEach(resetDb);

describe('users.locale', () => {
  it('defaults to vi on a freshly created user', async () => {
    const res = await app.request('/auth/session', { method: 'POST', headers: { 'x-test-uid': 'u1', 'x-test-name': 'Khoa' } });
    expect(res.status).toBe(200);
    expect((await res.json()).user.locale).toBe('vi');
  });

  it('PATCH /me { locale: "en" } persists and is echoed by GET /me', async () => {
    const { headers } = await asUser('u1', { name: 'Khoa' });
    const patched = await app.request('/me', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).user.locale).toBe('en');

    const read = await app.request('/me', { headers });
    expect((await read.json()).user.locale).toBe('en');
  });

  it('PATCH /me { locale } alone is a valid patch — displayName is untouched', async () => {
    const { headers } = await asUser('u1', { name: 'Khoa' });
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'en' }),
    });
    expect((await res.json()).user).toMatchObject({ displayName: 'Khoa', locale: 'en' });
  });

  it('PATCH /me { displayName } alone leaves a previously set locale untouched', async () => {
    const { headers } = await asUser('u1', { name: 'Khoa' });
    const patch = (body: unknown) => app.request('/me', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect((await patch({ locale: 'en' })).status).toBe(200);
    const res = await patch({ displayName: 'Khoa N' });
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ displayName: 'Khoa N', locale: 'en' });
    expect((await (await app.request('/me', { headers })).json()).user.locale).toBe('en');
  });

  it('rejects an unknown locale with 400', async () => {
    const { headers } = await asUser('u1', { name: 'Khoa' });
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'fr' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });
});
