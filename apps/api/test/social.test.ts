import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
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

const json = (headers: Record<string, string>) => ({ ...headers, 'content-type': 'application/json' });

beforeEach(async () => { await resetDb(); sender.reset(); clock = NOW; });
afterEach(() => { vi.restoreAllMocks(); });

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

  it('keeps the heart and answers 200 when the push bookkeeping throws', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const entry = await entryFor(owner.user.id);
    // Only the dedupe SELECT is broken — the heart is already committed by the time it runs, so
    // the route must not fail with it (spec §C).
    const select = db.select.bind(db);
    vi.spyOn(db, 'select').mockImplementation(((fields?: Record<string, unknown>) => {
      if (fields && fields.id === schema.notificationLog.id) throw new Error('bookkeeping down');
      return select(fields as never);
    }) as typeof db.select);

    const res = await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ heartCount: 1, heartedByMe: true });
    vi.restoreAllMocks();
    expect(await db.select().from(schema.entryHearts).where(eq(schema.entryHearts.entryId, entry.id))).toHaveLength(1);
  });

  it('requires an active member', async () => {
    const owner = await asUser('owner', { activate: true });
    // `asUser` creates an active member by default; `pending` parks it the way an admin would.
    const pending = await asUser('newbie', { pending: true });
    const entry = await entryFor(owner.user.id);
    expect((await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: pending.headers })).status).toBe(403);
  });
});

describe('comments', () => {
  it('posts, lists oldest first, and marks what I may delete', async () => {
    const owner = await asUser('owner', { activate: true, name: 'Khoa' });
    const me = await asUser('me', { activate: true, name: 'Linh' });
    const entry = await entryFor(owner.user.id);

    const posted = await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body: '  Giỏi quá!  ' }) });
    expect(posted.status).toBe(201);
    const first = await posted.json();
    expect(first.commentCount).toBe(1);
    expect(first.comment).toMatchObject({ entryId: entry.id, body: 'Giỏi quá!', canDelete: true, user: { id: me.user.id, displayName: 'Linh' } });

    clock = new Date(NOW.getTime() + 1000);
    await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(owner.headers), body: JSON.stringify({ body: 'Cảm ơn!' }) });

    const mine = await (await app.request(`/entries/${entry.id}/comments`, { headers: me.headers })).json();
    expect(mine.comments.map((c: { body: string }) => c.body)).toEqual(['Giỏi quá!', 'Cảm ơn!']);
    expect(mine.comments.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([true, false]);

    // The owner may delete anything on their entry.
    const owners = await (await app.request(`/entries/${entry.id}/comments`, { headers: owner.headers })).json();
    expect(owners.comments.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([true, true]);
  });

  it('pushes the owner with the excerpt, once per ten minutes', async () => {
    const owner = await asUser('owner', { activate: true });
    // The push renders in the OWNER's `users.locale`, so pin it rather than lean on the default.
    await db.update(schema.users).set({ locale: 'en' }).where(eq(schema.users.id, owner.user.id));
    await db.insert(schema.deviceTokens).values({ userId: owner.user.id, token: 't1', platform: 'ios', locale: 'en' });
    const me = await asUser('me', { activate: true, name: 'Linh' });
    const entry = await entryFor(owner.user.id);
    const long = 'b'.repeat(100);
    await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body: long }) });
    await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body: 'again' }) });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ title: 'Linh commented', body: `“${'b'.repeat(80)}…”`, data: { kind: 'comment', entryId: entry.id } });
  });

  it('lets the author and the owner delete, and nobody else', async () => {
    const owner = await asUser('owner', { activate: true });
    const author = await asUser('author', { activate: true });
    const stranger = await asUser('stranger', { activate: true });
    const entry = await entryFor(owner.user.id);
    const make = async () => (await (await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(author.headers), body: JSON.stringify({ body: 'x' }) })).json()).comment.id as string;

    const c1 = await make();
    expect((await app.request(`/comments/${c1}`, { method: 'DELETE', headers: stranger.headers })).status).toBe(403);
    expect((await app.request(`/comments/${c1}`, { method: 'DELETE', headers: author.headers })).status).toBe(204);
    const c2 = await make();
    expect((await app.request(`/comments/${c2}`, { method: 'DELETE', headers: owner.headers })).status).toBe(204);
    expect((await app.request(`/comments/${c2}`, { method: 'DELETE', headers: owner.headers })).status).toBe(404);
    const left = await (await app.request(`/entries/${entry.id}/comments`, { headers: owner.headers })).json();
    expect(left.comments).toEqual([]);
  });

  it('rejects whitespace and over-long bodies, and pending entries', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const entry = await entryFor(owner.user.id);
    const post = (body: string) => app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body }) });
    expect((await post('   ')).status).toBe(400);
    expect((await post('x'.repeat(501))).status).toBe(400);
    expect((await post('x'.repeat(500))).status).toBe(201);
    const pending = await entryFor(owner.user.id, 'pending');
    expect((await app.request(`/entries/${pending.id}/comments`, { headers: me.headers })).status).toBe(404);
  });

  // `r.use('/comments/:id', …)` is an exact-path pattern; prove it really guards the delete.
  it('requires authentication on DELETE /comments/:id', async () => {
    const res = await app.request('/comments/00000000-0000-4000-8000-000000000000', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('GET /feed social fields', () => {
  it('carries counts and my own heart flag, computed per page', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const other = await asUser('other', { activate: true });
    const hearted = await entryFor(owner.user.id);
    const plain = await entryFor(owner.user.id);
    await app.request(`/entries/${hearted.id}/heart`, { method: 'PUT', headers: me.headers });
    await app.request(`/entries/${hearted.id}/heart`, { method: 'PUT', headers: other.headers });
    await app.request(`/entries/${hearted.id}/comments`, { method: 'POST', headers: json(other.headers), body: JSON.stringify({ body: 'hi' }) });

    const feed = await (await app.request('/feed', { headers: me.headers })).json();
    const byId = Object.fromEntries(feed.entries.map((e: { id: string }) => [e.id, e]));
    expect(byId[hearted.id]).toMatchObject({ heartCount: 2, commentCount: 1, heartedByMe: true });
    expect(byId[plain.id]).toMatchObject({ heartCount: 0, commentCount: 0, heartedByMe: false });

    const theirs = await (await app.request('/feed', { headers: owner.headers })).json();
    expect(theirs.entries.find((e: { id: string }) => e.id === hearted.id)).toMatchObject({ heartCount: 2, heartedByMe: false });
  });
});
