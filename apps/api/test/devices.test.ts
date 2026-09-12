import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { app, resetDb, asUser } from './helpers.js';

const json = (h: Record<string, string>) => ({ ...h, 'content-type': 'application/json' });
const TOKEN = 'fcm-token-abc:APA91bH_example';

beforeEach(resetDb);

describe('POST /me/devices', () => {
  it('registers a token for the caller', async () => {
    const { headers, user } = await asUser('u', { activate: true });
    const res = await app.request('/me/devices', {
      method: 'POST',
      headers: json(headers),
      body: JSON.stringify({ token: TOKEN, platform: 'ios', locale: 'vi' }),
    });
    expect(res.status).toBe(201);
    const { device } = await res.json();
    expect(device).toMatchObject({ token: TOKEN, platform: 'ios', locale: 'vi' });
    const rows = await db.select().from(schema.deviceTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(user.id);
  });

  it('is idempotent: re-registering the same token updates it instead of duplicating', async () => {
    const { headers } = await asUser('u', { activate: true });
    const body = JSON.stringify({ token: TOKEN, platform: 'ios', locale: 'vi' });
    await app.request('/me/devices', { method: 'POST', headers: json(headers), body });
    const [before] = await db.select().from(schema.deviceTokens);

    const res = await app.request('/me/devices', {
      method: 'POST',
      headers: json(headers),
      body: JSON.stringify({ token: TOKEN, platform: 'ios', locale: 'en' }),
    });
    expect(res.status).toBe(201);
    const rows = await db.select().from(schema.deviceTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.locale).toBe('en');
    expect(rows[0]!.id).toBe(before!.id);
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before!.lastSeenAt.getTime());
  });

  it('moves a token to the new owner when the same phone signs in as someone else', async () => {
    const first = await asUser('u1', { activate: true });
    const second = await asUser('u2', { activate: true });
    const body = JSON.stringify({ token: TOKEN, platform: 'ios', locale: 'vi' });
    await app.request('/me/devices', { method: 'POST', headers: json(first.headers), body });
    await app.request('/me/devices', { method: 'POST', headers: json(second.headers), body });
    const rows = await db.select().from(schema.deviceTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(second.user.id);
  });

  it('defaults the locale to vi when it is omitted', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/me/devices', {
      method: 'POST', headers: json(headers), body: JSON.stringify({ token: TOKEN, platform: 'ios' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).device.locale).toBe('vi');
  });

  it('rejects an unknown platform with 400', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/me/devices', {
      method: 'POST', headers: json(headers), body: JSON.stringify({ token: TOKEN, platform: 'android' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it('rejects an empty token with 400', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/me/devices', {
      method: 'POST', headers: json(headers), body: JSON.stringify({ token: '', platform: 'ios' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a pending user with 403', async () => {
    const { headers } = await asUser('p');
    const res = await app.request('/me/devices', {
      method: 'POST', headers: json(headers), body: JSON.stringify({ token: TOKEN, platform: 'ios' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('pending_approval');
  });

  it('rejects an unauthenticated caller with 401', async () => {
    const res = await app.request('/me/devices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, platform: 'ios' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /me/devices/:token', () => {
  it('removes the caller own token', async () => {
    const { headers } = await asUser('u', { activate: true });
    await app.request('/me/devices', {
      method: 'POST', headers: json(headers), body: JSON.stringify({ token: TOKEN, platform: 'ios' }),
    });
    const res = await app.request(`/me/devices/${encodeURIComponent(TOKEN)}`, { method: 'DELETE', headers });
    expect(res.status).toBe(204);
    expect(await db.select().from(schema.deviceTokens)).toHaveLength(0);
  });

  it('does not let a member delete another member token', async () => {
    const owner = await asUser('u1', { activate: true });
    const other = await asUser('u2', { activate: true });
    await app.request('/me/devices', {
      method: 'POST', headers: json(owner.headers), body: JSON.stringify({ token: TOKEN, platform: 'ios' }),
    });
    const res = await app.request(`/me/devices/${encodeURIComponent(TOKEN)}`, { method: 'DELETE', headers: other.headers });
    expect(res.status).toBe(404);
    expect(await db.select().from(schema.deviceTokens)).toHaveLength(1);
  });

  it('returns 404 for a token that was never registered', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/me/devices/nope', { method: 'DELETE', headers });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });
});

describe('device_tokens cascade', () => {
  it('is cleared by resetDb so later suites start empty', async () => {
    const { headers } = await asUser('u', { activate: true });
    await app.request('/me/devices', {
      method: 'POST', headers: json(headers), body: JSON.stringify({ token: TOKEN, platform: 'ios' }),
    });
    await resetDb();
    expect(await db.select().from(schema.deviceTokens)).toHaveLength(0);
  });
});
