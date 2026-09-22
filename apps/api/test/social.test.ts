import { describe, it, expect, beforeEach } from 'vitest';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { fakeSender } from '../src/services/push.js';
import { resetDb, asUser, challengeId } from './helpers.js';

const NOW = new Date('2026-09-22T10:00:00Z');
let clock = NOW;
const sender = fakeSender();
const app = createApp({ sender, now: () => clock });

async function entryFor(userId: string, status: 'confirmed' | 'pending' = 'confirmed') {
  const [row] = await db.insert(schema.entries).values({
    userId, challengeId: await challengeId(), photoKey: `photos/${userId}/x.jpg`,
    takenAt: NOW, localDate: '2026-09-22', status,
  }).returning();
  await db.insert(schema.entryCategories).values({ entryId: row!.id, category: 'exercise', source: 'user' });
  return row!;
}

beforeEach(async () => { await resetDb(); sender.reset(); clock = NOW; });

describe('hearts', () => {
  it('PUT then DELETE move the count 0 → 1 → 1 → 0 and heartedByMe follows', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const entry = await entryFor(owner.user.id);

    const first = await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ heartCount: 1, heartedByMe: true });

    const again = await (await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers })).json();
    expect(again).toEqual({ heartCount: 1, heartedByMe: true });

    const gone = await (await app.request(`/entries/${entry.id}/heart`, { method: 'DELETE', headers: me.headers })).json();
    expect(gone).toEqual({ heartCount: 0, heartedByMe: false });
    const never = await (await app.request(`/entries/${entry.id}/heart`, { method: 'DELETE', headers: me.headers })).json();
    expect(never).toEqual({ heartCount: 0, heartedByMe: false });
  });

  it('counts other members and pushes the owner once per ten minutes', async () => {
    const owner = await asUser('owner', { activate: true, name: 'Khoa' });
    await db.insert(schema.deviceTokens).values({ userId: owner.user.id, token: 't1', platform: 'ios', locale: 'vi' });
    const a = await asUser('a', { activate: true, name: 'Linh' });
    const b = await asUser('b', { activate: true, name: 'Mai' });
    const entry = await entryFor(owner.user.id);

    await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: a.headers });
    const second = await (await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: b.headers })).json();
    expect(second).toEqual({ heartCount: 2, heartedByMe: true });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.title).toBe('Linh đã thả tim');

    clock = new Date(NOW.getTime() + 11 * 60 * 1000);
    await app.request(`/entries/${entry.id}/heart`, { method: 'DELETE', headers: b.headers });
    await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: b.headers });
    expect(sender.sent).toHaveLength(2);
  });

  it('hearting my own entry works but sends nothing', async () => {
    const me = await asUser('me', { activate: true });
    await db.insert(schema.deviceTokens).values({ userId: me.user.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await entryFor(me.user.id);
    const res = await (await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers })).json();
    expect(res).toEqual({ heartCount: 1, heartedByMe: true });
    expect(sender.sent).toHaveLength(0);
  });

  it('is 404 on a pending entry and on an unknown id', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const pending = await entryFor(owner.user.id, 'pending');
    expect((await app.request(`/entries/${pending.id}/heart`, { method: 'PUT', headers: me.headers })).status).toBe(404);
    expect((await app.request('/entries/00000000-0000-4000-8000-000000000000/heart', { method: 'PUT', headers: me.headers })).status).toBe(404);
    expect((await app.request('/entries/garbage/heart', { method: 'PUT', headers: me.headers })).status).toBe(400);
  });

  it('requires an active member', async () => {
    const owner = await asUser('owner', { activate: true });
    // `asUser` creates an active member by default; `pending` parks it the way an admin would.
    const pending = await asUser('newbie', { pending: true });
    const entry = await entryFor(owner.user.id);
    expect((await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: pending.headers })).status).toBe(403);
  });
});
