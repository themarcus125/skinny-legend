import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { storage } from '../src/services/storage.js';
import { resetDb, asUser } from './helpers.js';
import type { Verdict } from '../src/services/vision.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const verdict: Verdict = { categories: [], healthy: null, confidence: 0, reason: '', model: 'fake', latencyMs: 1, raw: '', failed: false };
const app = createApp({ classify: vi.fn(async () => verdict) });

beforeEach(resetDb);

async function confirmed(headers: Record<string, string>, takenAt: string, categories: string[]) {
  const h = { ...headers, 'content-type': 'application/json' };
  const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
  await storage.putObject(presign.key, png, 'image/png');
  const created = await (await app.request('/entries', { method: 'POST', headers: h, body: JSON.stringify({ photoKey: presign.key, takenAt }) })).json();
  await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories }) });
  return created.entry.id as string;
}

async function confirmedAt(headers: Record<string, string>, takenAt: string, categories: string[], extra: Record<string, unknown> = {}) {
  const h = { ...headers, 'content-type': 'application/json' };
  const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
  await storage.putObject(presign.key, png, 'image/png');
  const created = await (await app.request('/entries', { method: 'POST', headers: h, body: JSON.stringify({ photoKey: presign.key, takenAt, ...extra }) })).json();
  await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories }) });
  return created.entry.id as string;
}

// Freeze "today" at 2026-09-10 08:00 Vietnam time.
vi.useFakeTimers({ now: new Date('2026-09-10T01:00:00Z'), toFake: ['Date'] });

describe('GET /leaderboard', () => {
  it('ranks by total desc, includes weekPoints and isMe', async () => {
    const a = await asUser('a', { activate: true, name: 'A' });
    const b = await asUser('b', { activate: true, name: 'B' });
    await confirmed(a.headers, '2026-09-09T01:00:00Z', ['exercise']);
    await confirmed(b.headers, '2026-09-09T01:00:00Z', ['exercise', 'meal']);
    const body = await (await app.request('/leaderboard', { headers: a.headers })).json();
    expect(body.leaderboard.map((r: { rank: number; user: { displayName: string }; total: number; isMe: boolean }) => [r.rank, r.user.displayName, r.total, r.isMe]))
      .toEqual([[1, 'B', 5, false], [2, 'A', 3, true]]);
    expect(body.leaderboard[0].weekPoints).toBe(5);
  });

  it('excludes pending users', async () => {
    const a = await asUser('a', { activate: true });
    await asUser('p');
    const body = await (await app.request('/leaderboard', { headers: a.headers })).json();
    expect(body.leaderboard).toHaveLength(1);
  });

  it('gives tied users the same competition rank', async () => {
    const a = await asUser('a', { activate: true, name: 'A' });
    const b = await asUser('b', { activate: true, name: 'B' });
    await confirmed(a.headers, '2026-09-09T01:00:00Z', ['exercise']);
    await confirmed(b.headers, '2026-09-09T01:00:00Z', ['exercise']);
    const body = await (await app.request('/leaderboard', { headers: a.headers })).json();
    expect(body.leaderboard.map((r: { rank: number }) => r.rank)).toEqual([1, 1]);
    const dashboard = await (await app.request('/me/dashboard', { headers: a.headers })).json();
    expect(dashboard.rank).toBe(1);
    expect(dashboard.memberCount).toBe(2);
  });
});

describe('GET /me/dashboard', () => {
  it('reports today, yesterday, delta, rank and remaining', async () => {
    const a = await asUser('a', { activate: true });
    await confirmed(a.headers, '2026-09-09T01:00:00Z', ['exercise', 'meal']);
    await confirmed(a.headers, '2026-09-10T00:30:00Z', ['exercise']);
    const d = await (await app.request('/me/dashboard', { headers: a.headers })).json();
    expect(d.today.points).toBe(3);
    expect(d.yesterday.points).toBe(5);
    expect(d.deltaVsYesterday).toBe(-2);
    expect(d.rank).toBe(1);
    expect(d.streak.current).toBe(2);
    expect(d.remaining.sort()).toEqual(['group', 'meal']);
  });
});

describe('GET /me/trends', () => {
  it('returns weekly series, heatmap and category breakdown', async () => {
    const a = await asUser('a', { activate: true });
    const b = await asUser('b', { activate: true });
    await confirmed(a.headers, '2026-09-08T01:00:00Z', ['exercise']);
    await confirmed(b.headers, '2026-09-08T01:00:00Z', ['exercise', 'group']);
    const t = await (await app.request('/me/trends', { headers: a.headers })).json();
    const w = t.weeks.find((x: { week: string }) => x.week === '2026-W37');
    expect(w).toMatchObject({ mine: 3, groupAvg: 4.5, rank: 2 });
    expect(t.heatmap).toContainEqual({ date: '2026-09-08', points: 3 });
    expect(t.byCategory).toEqual({ exercise: 3, meal: 0, group: 0 });
  });
});

describe('read routes require auth', () => {
  it('GET /feed with no headers returns 401 unauthenticated', async () => {
    const res = await app.request('/feed');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('GET /users/:id/entries with no headers returns 401 unauthenticated', async () => {
    const res = await app.request('/users/00000000-0000-0000-0000-000000000000/entries');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthenticated');
  });
});

describe('GET /feed and GET /users/:id/entries', () => {
  it('rejects an invalid feed cursor with 400 instead of crashing', async () => {
    const a = await asUser('a', { activate: true });
    const res = await app.request('/feed?cursor=garbage', { headers: a.headers });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_body');
  });

  it('rejects a non-UUID user id with 400 instead of crashing', async () => {
    const a = await asUser('a', { activate: true });
    const res = await app.request('/users/not-a-uuid/entries', { headers: a.headers });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_body');
  });

  it('feed shows confirmed entries from everyone with user info and place', async () => {
    const a = await asUser('a', { activate: true, name: 'A' });
    const b = await asUser('b', { activate: true, name: 'B' });
    const id = await confirmed(a.headers, '2026-09-09T01:00:00Z', ['exercise']);
    await app.request(`/entries/${id}`, { method: 'PATCH', headers: { ...a.headers, 'content-type': 'application/json' }, body: JSON.stringify({ categories: ['exercise'], placeName: 'Gym X', placeSource: 'manual' }) });
    const feed = await (await app.request('/feed', { headers: b.headers })).json();
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]).toMatchObject({ user: { displayName: 'A' }, placeName: 'Gym X', categories: ['exercise'] });
    const theirs = await (await app.request(`/users/${a.user.id}/entries`, { headers: b.headers })).json();
    expect(theirs.entries).toHaveLength(1);
    expect(theirs.nextCursor).toBeNull();
  });

  it('pages another member’s history from a takenAt cursor', async () => {
    const a = await asUser('a', { activate: true, name: 'A' });
    const b = await asUser('b', { activate: true, name: 'B' });
    await confirmed(a.headers, '2026-09-08T01:00:00Z', ['exercise']);
    await confirmed(a.headers, '2026-09-09T01:00:00Z', ['exercise']);
    const all = await (await app.request(`/users/${a.user.id}/entries`, { headers: b.headers })).json();
    expect(all.entries.map((e: { localDate: string }) => e.localDate)).toEqual(['2026-09-09', '2026-09-08']);
    const page = await (await app.request(`/users/${a.user.id}/entries?cursor=${encodeURIComponent(all.entries[0].takenAt)}`, { headers: b.headers })).json();
    expect(page.entries.map((e: { localDate: string }) => e.localDate)).toEqual(['2026-09-08']);
  });

  it('feed omits pending entries', async () => {
    const a = await asUser('a', { activate: true });
    const h = { ...a.headers, 'content-type': 'application/json' };
    const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
    await storage.putObject(presign.key, png, 'image/png');
    await app.request('/entries', { method: 'POST', headers: h, body: JSON.stringify({ photoKey: presign.key, takenAt: '2026-09-09T01:00:00Z' }) });
    const feed = await (await app.request('/feed', { headers: a.headers })).json();
    expect(feed.entries).toEqual([]);
  });
});

describe('GET /entries/map', () => {
  it('returns confirmed pins with coordinates, newest first, with user info', async () => {
    const a = await asUser('a', { activate: true, name: 'A' });
    const b = await asUser('b', { activate: true, name: 'B' });
    await confirmedAt(a.headers, '2026-09-09T01:00:00Z', ['exercise'], { lat: 10.77, lng: 106.70, placeName: 'Gym X' });
    await confirmedAt(b.headers, '2026-09-10T01:00:00Z', ['meal'], { lat: 10.78, lng: 106.71 });
    await confirmedAt(a.headers, '2026-09-08T01:00:00Z', ['group'], {}); // no coords → excluded
    const body = await (await app.request('/entries/map?days=30', { headers: a.headers })).json();
    expect(body.pins.map((p: { user: { displayName: string } }) => p.user.displayName)).toEqual(['B', 'A']);
    expect(body.pins[1]).toMatchObject({ lat: 10.77, lng: 106.7, placeName: 'Gym X', categories: ['exercise'] });
  });
  it('excludes pending entries and entries outside the window', async () => {
    const a = await asUser('a', { activate: true });
    // Out-of-window confirmed entry
    await confirmedAt(a.headers, '2026-08-01T01:00:00Z', ['exercise'], { lat: 1, lng: 1 });
    // Pending entry inside the window
    const h = { ...a.headers, 'content-type': 'application/json' };
    const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
    await storage.putObject(presign.key, png, 'image/png');
    await app.request('/entries', { method: 'POST', headers: h, body: JSON.stringify({ photoKey: presign.key, takenAt: '2026-09-09T01:00:00Z', lat: 10.77, lng: 106.70 }) });
    const body = await (await app.request('/entries/map?days=30', { headers: a.headers })).json();
    expect(body.pins).toEqual([]);
  });
  it('rejects days outside 1–90', async () => {
    const a = await asUser('a', { activate: true });
    expect((await app.request('/entries/map?days=0', { headers: a.headers })).status).toBe(400);
  });
});
