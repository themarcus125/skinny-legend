import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { storage } from '../src/services/storage.js';
import { pushSender, type FakeSender } from '../src/services/push.js';
import { resetDb, asUser } from './helpers.js';
import type { Verdict } from '../src/services/vision.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const verdict: Verdict = { categories: ['exercise'], healthy: null, confidence: 1, reason: '', model: 'fake', latencyMs: 1, raw: '', failed: false };
const app = createApp({ classify: vi.fn(async () => verdict) });
const json = (h: Record<string, string>) => ({ ...h, 'content-type': 'application/json' });
const fake = pushSender as FakeSender;

beforeEach(async () => {
  await resetDb();
  fake.reset();
});

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

// ---- notifications (spec §E, SKI-70)
async function seedLog(userId: string, kind: 'inactive_1d' | 'rank_nudge', sentAt: Date) {
  await db.insert(schema.notificationLog).values({ userId, kind, payloadJson: { title: 'T', body: 'B', locale: 'vi', vars: {} }, sentAt });
}

function testSend(headers: Record<string, string>, userId: string) {
  return app.request('/admin/notifications/test', { method: 'POST', headers: json(headers), body: JSON.stringify({ userId }) });
}

describe('GET /admin/notifications', () => {
  it('returns the log newest first with the member joined in', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true, name: 'Minh' });
    await seedLog(member.user.id, 'inactive_1d', new Date('2026-09-18T13:00:00Z'));
    await seedLog(member.user.id, 'rank_nudge', new Date('2026-09-19T13:00:00Z'));

    const res = await app.request('/admin/notifications', { headers: admin.headers });
    expect(res.status).toBe(200);
    const { notifications } = await res.json();
    expect(notifications.map((n: { kind: string }) => n.kind)).toEqual(['rank_nudge', 'inactive_1d']);
    expect(notifications[0].user).toEqual({ id: member.user.id, displayName: 'Minh' });
    expect(notifications[0].payload).toMatchObject({ title: 'T', body: 'B', locale: 'vi' });
    expect(notifications[0].sentAt).toBe('2026-09-19T13:00:00.000Z');
    expect(typeof notifications[0].id).toBe('string');
  });

  it('honours the limit', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    for (let i = 0; i < 3; i += 1) await seedLog(member.user.id, 'inactive_1d', new Date(`2026-09-1${i + 1}T13:00:00Z`));
    const res = await app.request('/admin/notifications?limit=2', { headers: admin.headers });
    expect(res.status).toBe(200);
    expect((await res.json()).notifications).toHaveLength(2);
  });

  it('rejects a limit outside 1..200 with 400', async () => {
    const admin = await asUser('adm', { admin: true });
    for (const limit of ['201', '0', 'abc']) {
      const res = await app.request(`/admin/notifications?limit=${limit}`, { headers: admin.headers });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_body');
    }
  });

  it('is admin only', async () => {
    const member = await asUser('m', { activate: true });
    expect((await app.request('/admin/notifications', { headers: member.headers })).status).toBe(403);
  });
});

describe('POST /admin/notifications/test', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends to every device the member has and audits it', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    await db.insert(schema.deviceTokens).values([
      { userId: member.user.id, token: 'tok-a', platform: 'ios', locale: 'vi' },
      { userId: member.user.id, token: 'tok-b', platform: 'ios', locale: 'vi' },
    ]);

    const res = await testSend(admin.headers, member.user.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, tokens: 2, removedTokens: 0 });
    expect(fake.sent.map((m) => m.token).sort()).toEqual(['tok-a', 'tok-b']);
    expect(fake.sent[0]!.title).toBe('Thử thông báo');
    expect(fake.sent[0]!.data).toEqual({ deepLink: 'track', kind: 'test' });

    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admin.user.id, action: 'notification.test', targetType: 'user', targetId: member.user.id });
  });

  it('uses the locale of the most recently seen device, not the last inserted', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    await db.insert(schema.deviceTokens).values([
      { userId: member.user.id, token: 'tok-en', platform: 'ios', locale: 'en', lastSeenAt: new Date('2026-09-12T10:00:00Z') },
      { userId: member.user.id, token: 'tok-vi', platform: 'ios', locale: 'vi', lastSeenAt: new Date('2026-09-01T10:00:00Z') },
    ]);
    expect((await testSend(admin.headers, member.user.id)).status).toBe(200);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent.every((m) => m.title === 'Test notification')).toBe(true);
  });

  it('writes no notification_log row: a test send is not a planned reminder', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    await db.insert(schema.deviceTokens).values({ userId: member.user.id, token: 'tok-a', platform: 'ios', locale: 'vi' });
    expect((await testSend(admin.headers, member.user.id)).status).toBe(200);
    expect(await db.select().from(schema.notificationLog)).toHaveLength(0);
  });

  it('drops a token FCM reports as unregistered', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    await db.insert(schema.deviceTokens).values([
      { userId: member.user.id, token: 'tok-dead', platform: 'ios', locale: 'vi' },
      { userId: member.user.id, token: 'tok-live', platform: 'ios', locale: 'vi' },
    ]);
    fake.failures.set('tok-dead', { unregistered: true, error: 'gone' });

    const res = await testSend(admin.headers, member.user.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, tokens: 2, removedTokens: 1 });
    expect((await db.select().from(schema.deviceTokens)).map((d) => d.token)).toEqual(['tok-live']);
  });

  it('keeps a token that failed for a reason other than unregistered', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    await db.insert(schema.deviceTokens).values({ userId: member.user.id, token: 'tok-flaky', platform: 'ios', locale: 'vi' });
    fake.failures.set('tok-flaky', { unregistered: false, error: 'internal' });

    expect(await (await testSend(admin.headers, member.user.id)).json()).toEqual({ sent: 0, tokens: 1, removedTokens: 0 });
    expect(await db.select().from(schema.deviceTokens)).toHaveLength(1);
  });

  it('maps a thrown FCM outage to a 502 envelope and writes no audit row', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    await db.insert(schema.deviceTokens).values({ userId: member.user.id, token: 'tok-a', platform: 'ios', locale: 'vi' });
    vi.spyOn(pushSender, 'send').mockRejectedValueOnce(new Error('fcm down'));

    const res = await testSend(admin.headers, member.user.id);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('push_failed');
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
    expect(await db.select().from(schema.deviceTokens)).toHaveLength(1);
  });

  it('returns 400 no_device_tokens when the member has no device', async () => {
    const admin = await asUser('adm', { admin: true });
    const member = await asUser('m', { activate: true });
    const res = await testSend(admin.headers, member.user.id);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('no_device_tokens');
    expect(fake.sent).toHaveLength(0);
  });

  it('returns 404 for an unknown user', async () => {
    const admin = await asUser('adm', { admin: true });
    const res = await testSend(admin.headers, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('rejects a non-uuid userId with 400', async () => {
    const admin = await asUser('adm', { admin: true });
    const res = await testSend(admin.headers, 'nope');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_body');
  });

  it('is admin only', async () => {
    const member = await asUser('m', { activate: true });
    expect((await testSend(member.headers, member.user.id)).status).toBe(403);
    expect(fake.sent).toHaveLength(0);
  });
});
