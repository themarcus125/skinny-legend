import { describe, it, expect, beforeEach } from 'vitest';
import { app, resetDb, asUser } from './helpers.js';

beforeEach(resetDb);

describe('POST /auth/session', () => {
  it('creates a pending user on first login', async () => {
    const res = await app.request('/auth/session', { method: 'POST', headers: { 'x-test-uid': 'u1', 'x-test-name': 'Khoa' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ displayName: 'Khoa', status: 'pending', role: 'member' });
  });

  it('returns the same user on second login', async () => {
    const a = await (await app.request('/auth/session', { method: 'POST', headers: { 'x-test-uid': 'u1', 'x-test-name': 'Khoa' } })).json();
    const b = await (await app.request('/auth/session', { method: 'POST', headers: { 'x-test-uid': 'u1', 'x-test-name': 'Khoa' } })).json();
    expect(a.user.id).toBe(b.user.id);
  });

  it('rejects missing auth', async () => {
    const res = await app.request('/auth/session', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: 'Missing or invalid token' } });
  });
});

describe('GET /me and PATCH /me', () => {
  it('pending users can read and update their profile', async () => {
    const { headers } = await asUser('u1', { name: 'Khoa' });
    const res = await app.request('/me', { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Khoa N' }) });
    expect(res.status).toBe(200);
    const me = await (await app.request('/me', { headers })).json();
    expect(me.user.displayName).toBe('Khoa N');
  });

  it('pending users cannot access active-only routes', async () => {
    const { headers } = await asUser('u1');
    const res = await app.request('/leaderboard', { headers });
    expect(res.status).toBe(403);
  });
});
