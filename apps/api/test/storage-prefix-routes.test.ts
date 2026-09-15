import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Hono } from 'hono';
import type { Verdict } from '../src/services/vision.js';

/**
 * STORAGE_KEY_PREFIX is read at import time, so this whole file runs against a module graph
 * re-imported with the prefix stubbed. The routes that accept a client-supplied key must accept
 * the prefixed keys the API itself mints and keep rejecting anything else.
 */
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const okVerdict: Verdict = { categories: ['exercise'], healthy: null, confidence: 0.9, reason: 'Gym.', model: 'fake', latencyMs: 1, raw: '{}', failed: false };

let helpers: typeof import('./helpers.js');
let storageMod: typeof import('../src/services/storage.js');
let app: Hono<never>;

beforeAll(async () => {
  vi.stubEnv('STORAGE_KEY_PREFIX', 'e2e/');
  vi.resetModules();
  storageMod = await import('../src/services/storage.js');
  helpers = await import('./helpers.js');
  const { createApp } = await import('../src/app.js');
  app = createApp({ classify: async () => okVerdict }) as unknown as Hono<never>;
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

beforeEach(async () => { await helpers.resetDb(); });

function json(headers: Record<string, string>, body: unknown) {
  return { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

describe('STORAGE_KEY_PREFIX and the ownership checks', () => {
  it('accepts the prefixed photo key /uploads/presign minted and rejects an unprefixed one', async () => {
    const { headers, user } = await helpers.asUser('u1', { activate: true });
    const presign = await (await app.request('/uploads/presign', json(headers, { kind: 'photo', contentType: 'image/png' }))).json();
    expect(presign.key).toMatch(/^e2e\/photos\//);
    await storageMod.storage.putObject(presign.key, png, 'image/png');

    const ok = await app.request('/entries', json(headers, { photoKey: presign.key, takenAt: '2026-09-10T01:00:00Z' }));
    expect(ok.status).toBe(201);

    const unprefixed = `photos/${user.id}/nope.jpg`;
    await storageMod.storage.putObject(unprefixed, png, 'image/png');
    const bad = await app.request('/entries', json(headers, { photoKey: unprefixed, takenAt: '2026-09-10T01:00:00Z' }));
    expect(bad.status).toBe(403);
  });

  it('accepts a prefixed avatar key on PATCH /me and rejects an unprefixed one', async () => {
    const { headers, user } = await helpers.asUser('u2', { activate: true });
    const avatarKey = storageMod.newKey('avatar', user.id, 'png');
    expect(avatarKey).toMatch(/^e2e\/avatars\//);
    const ok = await app.request('/me', { ...json(headers, { avatarKey }), method: 'PATCH' });
    expect(ok.status).toBe(200);
    const bad = await app.request('/me', { ...json(headers, { avatarKey: `avatars/${user.id}/nope.png` }), method: 'PATCH' });
    expect(bad.status).toBe(403);
  });

  it('accepts a prefixed screenshot key on POST /feedback and rejects an unprefixed one', async () => {
    const { headers, user } = await helpers.asUser('u3', { activate: true });
    const screenshotKey = storageMod.newKey('feedback', user.id, 'png');
    expect(screenshotKey).toMatch(/^e2e\/feedback\//);
    const ok = await app.request('/feedback', json(headers, { message: 'hi', screenshotKey }));
    expect(ok.status).toBe(201);
    const bad = await app.request('/feedback', json(headers, { message: 'hi', screenshotKey: `feedback/${user.id}/nope.png` }));
    expect(bad.status).toBe(403);
  });
});
