import { describe, it, expect, beforeEach, vi } from 'vitest';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { storage } from '../src/services/storage.js';
import { resetDb, asUser } from './helpers.js';
import type { Verdict } from '../src/services/vision.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const okVerdict: Verdict = { categories: ['exercise'], healthy: null, confidence: 0.9, reason: 'Gym.', model: 'fake', latencyMs: 1, raw: '{}', failed: false };
const classify = vi.fn(async () => okVerdict);
const app = createApp({ classify });

beforeEach(async () => { await resetDb(); classify.mockResolvedValue(okVerdict); });

async function uploadPhoto(headers: Record<string, string>) {
  const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
  await storage.putObject(presign.key, png, 'image/png');
  return presign.key as string;
}

async function post(headers: Record<string, string>, body: unknown) {
  return app.request('/entries', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('POST /entries', () => {
  it('creates a pending entry with AI categories and a thumbnail', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const res = await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry).toMatchObject({ status: 'pending', categories: ['exercise'], localDate: '2026-09-10' });
    expect(body.verdict).toMatchObject({ categories: ['exercise'], reason: 'Gym.', failed: false });
    expect(body.projectedPoints).toBe(3);
    const [row] = await db.select().from(schema.entries);
    expect(row?.thumbKey).toMatch(/^thumbs\//);
    expect(classify).toHaveBeenCalledOnce();
  });

  it('stores location fields', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const body = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z', lat: 10.77, lng: 106.7, placeName: 'California Fitness', placeSource: 'poi' })).json();
    expect(body.entry).toMatchObject({ placeName: 'California Fitness', placeSource: 'poi' });
  });

  it('still creates the entry when the classifier fails', async () => {
    classify.mockResolvedValue({ ...okVerdict, categories: [], failed: true });
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const body = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    expect(body.entry.categories).toEqual([]);
    expect(body.verdict.failed).toBe(true);
  });

  it('rejects a photoKey belonging to another user', async () => {
    const a = await asUser('a', { activate: true });
    const b = await asUser('b', { activate: true });
    const key = await uploadPhoto(a.headers);
    const res = await post(b.headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' });
    expect(res.status).toBe(403);
  });

  it('projectedPoints reflects a hit day cap', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const k1 = await uploadPhoto(headers);
    const first = await (await post(headers, { photoKey: k1, takenAt: '2026-09-10T01:00:00Z' })).json();
    await app.request(`/entries/${first.entry.id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ categories: ['exercise'] }) });
    const k2 = await uploadPhoto(headers);
    const second = await (await post(headers, { photoKey: k2, takenAt: '2026-09-10T05:00:00Z' })).json();
    expect(second.projectedPoints).toBe(0);
    expect(second.capsHit.exercise).toBe(true);
    expect(second.capsHit.meal).toBe(false);
  });

  it('cappedCategories is empty for the first exercise+meal entry of the day', async () => {
    classify.mockResolvedValue({ ...okVerdict, categories: ['exercise', 'meal'] });
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const body = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    expect(body.projectedPoints).toBe(5);
    expect(body.cappedCategories).toEqual([]);
  });

  it('cappedCategories flags only the category actually capped in a mixed entry', async () => {
    classify.mockResolvedValue({ ...okVerdict, categories: ['meal'] });
    const { headers } = await asUser('u1', { activate: true });
    const h = { ...headers, 'content-type': 'application/json' };
    const k1 = await uploadPhoto(headers);
    const earlierMeal = await (await post(headers, { photoKey: k1, takenAt: '2026-09-10T01:00:00Z' })).json();
    await app.request(`/entries/${earlierMeal.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories: ['meal'] }) });

    classify.mockResolvedValue({ ...okVerdict, categories: ['exercise', 'meal'] });
    const k2 = await uploadPhoto(headers);
    const second = await (await post(headers, { photoKey: k2, takenAt: '2026-09-10T05:00:00Z' })).json();
    expect(second.projectedPoints).toBe(3);
    expect(second.cappedCategories).toEqual(['meal']);
    expect(second.capsHit.meal).toBe(true);
  });

  it('dedupes duplicate AI categories before insert', async () => {
    classify.mockResolvedValue({ ...okVerdict, categories: ['exercise', 'exercise'] as any });
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const res = await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry.categories).toEqual(['exercise']);
    const cats = await db.select().from(schema.entryCategories);
    expect(cats.length).toBe(1);
  });

  it('does not pre-suggest an unhealthy meal', async () => {
    classify.mockResolvedValue({ ...okVerdict, categories: ['meal'], healthy: false });
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const res = await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry.categories).toEqual([]);
    expect(body.verdict.healthy).toBe(false);
    expect(body.verdict.categories).toEqual(['meal']);
    expect(body.projectedPoints).toBe(0);
    const [verdict] = await db.select().from(schema.aiVerdicts);
    expect(verdict).toMatchObject({ healthy: false, categoriesJson: ['meal'] });
  });

  it('keeps the other categories of an unhealthy meal photo', async () => {
    classify.mockResolvedValue({ ...okVerdict, categories: ['meal', 'group'], healthy: false });
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const body = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    expect(body.entry.categories).toEqual(['group']);
  });

  it('rejects a takenAt more than 10 minutes in the future', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const res = await post(headers, { photoKey: key, takenAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('taken_at_future');
  });

  it('allows a takenAt a few minutes ahead of the server clock', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const res = await post(headers, { photoKey: key, takenAt: new Date(Date.now() + 60 * 1000).toISOString() });
    expect(res.status).toBe(201);
  });

  it('rejects an undecodable photo with photo_invalid', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
    await storage.putObject(presign.key, Buffer.from('not an image'), 'image/png');
    const res = await post(headers, { photoKey: presign.key, takenAt: '2026-09-10T01:00:00Z' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('photo_invalid');
  });
});

describe('PATCH /entries/:id', () => {
  it('confirms with edited categories, source=user', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const created = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    const res = await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ categories: ['exercise', 'group'] }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.status).toBe('confirmed');
    expect(body.entry.categories.sort()).toEqual(['exercise', 'group']);
    expect(body.projectedPoints).toBe(6);
    const cats = await db.select().from(schema.entryCategories);
    expect(cats.every((c) => c.source === 'user')).toBe(true);
  });

  it('can re-edit an already confirmed entry (history edit)', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const created = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    const h = { ...headers, 'content-type': 'application/json' };
    await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories: ['exercise'] }) });
    const body = await (await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories: ['meal'] }) })).json();
    expect(body.entry.categories).toEqual(['meal']);
  });

  it("cannot edit someone else's entry", async () => {
    const a = await asUser('a', { activate: true });
    const b = await asUser('b', { activate: true });
    const key = await uploadPhoto(a.headers);
    const created = await (await post(a.headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    const res = await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: { ...b.headers, 'content-type': 'application/json' }, body: JSON.stringify({ categories: ['meal'] }) });
    expect(res.status).toBe(404);
  });

  it('rejects a non-uuid id with 400', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const res = await app.request('/entries/garbage', { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ categories: ['meal'] }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it("computes capsHit for the entry's own day/week, not today", async () => {
    const { headers } = await asUser('u1', { activate: true });
    const h = { ...headers, 'content-type': 'application/json' };
    const key = await uploadPhoto(headers);
    const created = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    const res = await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories: ['exercise', 'group'] }) });
    const body = await res.json();
    expect(body.capsHit.exercise).toBe(true);
    expect(body.capsHit.group).toBe(false);
  });
});

describe('DELETE /entries/:id and GET /entries/mine', () => {
  it('soft-deletes and hides from history', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const key = await uploadPhoto(headers);
    const created = await (await post(headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ categories: ['exercise'] }) });
    expect((await app.request(`/entries/${created.entry.id}`, { method: 'DELETE', headers })).status).toBe(204);
    const mine = await (await app.request('/entries/mine', { headers })).json();
    expect(mine.entries).toEqual([]);
    const [row] = await db.select().from(schema.entries);
    expect(row?.status).toBe('rejected');
  });

  it('history lists newest first with points', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const h = { ...headers, 'content-type': 'application/json' };
    for (const t of ['2026-09-09T01:00:00Z', '2026-09-10T01:00:00Z']) {
      const key = await uploadPhoto(headers);
      const created = await (await post(headers, { photoKey: key, takenAt: t })).json();
      await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories: ['exercise'] }) });
    }
    const mine = await (await app.request('/entries/mine', { headers })).json();
    expect(mine.entries.map((e: { localDate: string }) => e.localDate)).toEqual(['2026-09-10', '2026-09-09']);
    expect(mine.entries[0].points).toBe(3);
    expect(mine.nextCursor).toBeNull();
  });

  it('history pages backwards from a takenAt cursor', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const h = { ...headers, 'content-type': 'application/json' };
    for (const t of ['2026-09-08T01:00:00Z', '2026-09-09T01:00:00Z', '2026-09-10T01:00:00Z']) {
      const key = await uploadPhoto(headers);
      const created = await (await post(headers, { photoKey: key, takenAt: t })).json();
      await app.request(`/entries/${created.entry.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ categories: ['exercise'] }) });
    }
    const all = await (await app.request('/entries/mine', { headers })).json();
    const cursor = all.entries[0].takenAt as string;
    const page = await (await app.request(`/entries/mine?cursor=${encodeURIComponent(cursor)}`, { headers })).json();
    expect(page.entries.map((e: { localDate: string }) => e.localDate)).toEqual(['2026-09-09', '2026-09-08']);
    expect(page.nextCursor).toBeNull();
  });

  it('rejects a malformed history cursor with 400', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const res = await app.request('/entries/mine?cursor=nope', { headers });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it('rejects a non-uuid id with 400', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const res = await app.request('/entries/garbage', { method: 'DELETE', headers });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it("cannot delete someone else's entry", async () => {
    const a = await asUser('a', { activate: true });
    const b = await asUser('b', { activate: true });
    const key = await uploadPhoto(a.headers);
    const created = await (await post(a.headers, { photoKey: key, takenAt: '2026-09-10T01:00:00Z' })).json();
    const res = await app.request(`/entries/${created.entry.id}`, { method: 'DELETE', headers: b.headers });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(schema.entries);
    expect(row?.status).toBe('pending');
  });
});
