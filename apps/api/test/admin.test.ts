import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { storage } from '../src/services/storage.js';
import { resetDb, asUser } from './helpers.js';
import type { Verdict } from '../src/services/vision.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const verdict: Verdict = { categories: ['exercise'], healthy: null, confidence: 1, reason: '', model: 'fake', latencyMs: 1, raw: '', failed: false };
const app = createApp({ classify: vi.fn(async () => verdict) });
const json = (h: Record<string, string>) => ({ ...h, 'content-type': 'application/json' });

beforeEach(resetDb);

async function createEntry(headers: Record<string, string>) {
  const presign = await (await app.request('/uploads/presign', { method: 'POST', headers: json(headers), body: JSON.stringify({ kind: 'photo', contentType: 'image/png' }) })).json();
  await storage.putObject(presign.key, png, 'image/png');
  const created = await (await app.request('/entries', { method: 'POST', headers: json(headers), body: JSON.stringify({ photoKey: presign.key, takenAt: '2026-09-09T01:00:00Z' }) })).json();
  return created.entry.id as string;
}

describe('POST /feedback', () => {
  it('stores feedback', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/feedback', { method: 'POST', headers: json(headers), body: JSON.stringify({ message: 'App crash khi upload', appVersion: '1.0.0' }) });
    expect(res.status).toBe(201);
    expect(await db.select().from(schema.feedback)).toHaveLength(1);
  });

  it('rejects a screenshotKey owned by another user', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/feedback', { method: 'POST', headers: json(headers), body: JSON.stringify({ message: 'hi', screenshotKey: 'feedback/00000000-0000-0000-0000-000000000000/s.jpg' }) });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });
});

describe('admin guard', () => {
  it('members get 403', async () => {
    const { headers } = await asUser('u', { activate: true });
    expect((await app.request('/admin/users', { headers })).status).toBe(403);
  });

  it('members cannot patch other users', async () => {
    const member = await asUser('u', { activate: true });
    const target = await asUser('t', { activate: true });
    const res = await app.request(`/admin/users/${target.user.id}`, { method: 'PATCH', headers: json(member.headers), body: JSON.stringify({ status: 'disabled' }) });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
  });
});

describe('admin users', () => {
  it('activates a pending user and audits it', async () => {
    const admin = await asUser('adm', { admin: true });
    const pending = await asUser('p');
    const res = await app.request(`/admin/users/${pending.user.id}`, { method: 'PATCH', headers: json(admin.headers), body: JSON.stringify({ status: 'active' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).user.status).toBe('active');
    const [audit] = await db.select().from(schema.auditLog);
    expect(audit).toMatchObject({ actorId: admin.user.id, action: 'user.update', targetId: pending.user.id });
  });

  it('rejects a non-uuid id with 400', async () => {
    const admin = await asUser('adm', { admin: true });
    const res = await app.request('/admin/users/not-a-uuid', { method: 'PATCH', headers: json(admin.headers), body: JSON.stringify({ status: 'active' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it('rejects an empty patch with 400', async () => {
    const admin = await asUser('adm', { admin: true });
    const target = await asUser('p');
    const res = await app.request(`/admin/users/${target.user.id}`, { method: 'PATCH', headers: json(admin.headers), body: JSON.stringify({}) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it('404s on a well-formed but nonexistent id and writes no audit row', async () => {
    const admin = await asUser('adm', { admin: true });
    const res = await app.request('/admin/users/00000000-0000-0000-0000-000000000000', { method: 'PATCH', headers: json(admin.headers), body: JSON.stringify({ status: 'active' }) });
    expect(res.status).toBe(404);
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });
});

describe('admin entries', () => {
  it('overrides categories with source=admin and can reject', async () => {
    const admin = await asUser('adm', { admin: true });
    const u = await asUser('u', { activate: true });
    const id = await createEntry(u.headers);
    const res = await app.request(`/admin/entries/${id}`, { method: 'PATCH', headers: json(admin.headers), body: JSON.stringify({ categories: ['meal'], status: 'confirmed' }) });
    expect(res.status).toBe(200);
    const cats = await db.select().from(schema.entryCategories);
    expect(cats).toEqual([expect.objectContaining({ category: 'meal', source: 'admin' })]);
    expect((await app.request(`/admin/entries/${id}`, { method: 'DELETE', headers: admin.headers })).status).toBe(204);
    const [row] = await db.select().from(schema.entries);
    expect(row?.status).toBe('rejected');
    expect(await db.select().from(schema.auditLog)).toHaveLength(2);
  });

  it('lists entries with filters', async () => {
    const admin = await asUser('adm', { admin: true });
    const u = await asUser('u', { activate: true });
    await createEntry(u.headers);
    const list = await (await app.request(`/admin/entries?user=${u.user.id}&status=pending`, { headers: admin.headers })).json();
    expect(list.entries).toHaveLength(1);
    expect(list.entries[0].verdict).toMatchObject({ confidence: 1 });
  });
});

describe('admin rules', () => {
  // The PUT below overwrites the shared seeded challenge/rules; other test files run in the
  // same DB (fileParallelism: false) and assume the seeded defaults, so restore them afterward.
  let snapshotChallenge: typeof schema.challenges.$inferSelect;
  let snapshotRules: (typeof schema.scoringRules.$inferSelect)[];

  beforeEach(async () => {
    [snapshotChallenge] = await db.select().from(schema.challenges).limit(1);
    snapshotRules = await db.select().from(schema.scoringRules).where(eq(schema.scoringRules.challengeId, snapshotChallenge.id));
  });

  afterEach(async () => {
    await db.update(schema.challenges).set({
      startDate: snapshotChallenge.startDate, endDate: snapshotChallenge.endDate,
      streakPoints: snapshotChallenge.streakPoints, streakLength: snapshotChallenge.streakLength,
    }).where(eq(schema.challenges.id, snapshotChallenge.id));
    await db.delete(schema.scoringRules).where(eq(schema.scoringRules.challengeId, snapshotChallenge.id));
    await db.insert(schema.scoringRules).values(snapshotRules.map(({ id: _id, ...r }) => r));
  });

  it('updates rules and challenge dates', async () => {
    const admin = await asUser('adm', { admin: true });
    const res = await app.request('/admin/rules', { method: 'PUT', headers: json(admin.headers), body: JSON.stringify({
      challenge: { startDate: '2026-09-08', endDate: '2026-12-24', streakPoints: 6, streakLength: 7 },
      rules: [
        { category: 'exercise', points: 4, capCount: 1, capPeriod: 'day' },
        { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
        { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
      ],
    }) });
    expect(res.status).toBe(200);
    const got = await (await app.request('/admin/rules', { headers: admin.headers })).json();
    expect(got.challenge.streakPoints).toBe(6);
    expect(got.rules.find((r: { category: string }) => r.category === 'exercise').points).toBe(4);
    const audits = await db.select().from(schema.auditLog);
    expect(audits.some((a) => a.action === 'rules.update')).toBe(true);
  });

  it('rejects duplicate categories with 400 and leaves rules unchanged', async () => {
    const admin = await asUser('adm', { admin: true });
    const res = await app.request('/admin/rules', { method: 'PUT', headers: json(admin.headers), body: JSON.stringify({
      challenge: { startDate: '2026-09-08', endDate: '2026-12-24', streakPoints: 6, streakLength: 7 },
      rules: [
        { category: 'exercise', points: 4, capCount: 1, capPeriod: 'day' },
        { category: 'exercise', points: 5, capCount: 1, capPeriod: 'day' },
        { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
      ],
    }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
    const rules = await db.select().from(schema.scoringRules).where(eq(schema.scoringRules.challengeId, snapshotChallenge.id));
    expect(rules).toHaveLength(3);
  });
});

describe('admin feedback', () => {
  it('lists feedback with user', async () => {
    const admin = await asUser('adm', { admin: true });
    const u = await asUser('u', { activate: true, name: 'U' });
    await app.request('/feedback', { method: 'POST', headers: json(u.headers), body: JSON.stringify({ message: 'hi', appVersion: '1' }) });
    const list = await (await app.request('/admin/feedback', { headers: admin.headers })).json();
    expect(list.feedback[0]).toMatchObject({ message: 'hi', user: { displayName: 'U' } });
  });
});
