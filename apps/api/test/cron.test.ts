import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '../src/env.js';
import { storage } from '../src/services/storage.js';
import { app, resetDb } from './helpers.js';

const SECRET = 'test-cron-secret';
const original = env.CRON_SECRET;

beforeEach(async () => {
  await resetDb();
  // The in-memory bucket outlives `resetDb`, so start it empty.
  (storage as unknown as { objects: Map<string, Buffer> }).objects.clear();
  await storage.putObject('photos/x/orphan.jpg', Buffer.from('x'), 'image/jpeg');
  env.CRON_SECRET = SECRET;
});

afterEach(() => {
  env.CRON_SECRET = original;
});

const cleanup = (authorization?: string) =>
  app.request('/cron/cleanup', authorization === undefined ? {} : { headers: { Authorization: authorization } });

describe('GET /cron/cleanup', () => {
  it('refuses a request with no Authorization header', async () => {
    const res = await cleanup();
    expect(res.status).toBe(401);
  });

  it('refuses a wrong bearer token', async () => {
    const res = await cleanup('Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('refuses every request while CRON_SECRET is empty', async () => {
    env.CRON_SECRET = '';
    expect((await cleanup('Bearer ')).status).toBe(401);
    expect((await cleanup('Bearer undefined')).status).toBe(401);
  });

  it('sweeps orphans with the right bearer token', async () => {
    const res = await cleanup(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
  });
});
