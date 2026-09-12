import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { fakeSender, type PushMessage, type PushSender } from '../src/services/push.js';
import { runNotifyJob } from '../src/jobs/notify.js';
import { resetDb, asUser, challengeId } from './helpers.js';

// 2026-09-20 20:00 ICT — the instant the Railway cron fires.
const NOW = new Date('2026-09-20T13:00:00Z');

beforeEach(resetDb);

/** Confirms one exercise entry for `userId` on `localDate` (worth 3 points). */
async function logExercise(userId: string, localDate: string) {
  const [entry] = await db.insert(schema.entries).values({
    userId,
    challengeId: await challengeId(),
    photoKey: `photos/${userId}/${localDate}.jpg`,
    takenAt: new Date(`${localDate}T08:00:00+07:00`),
    localDate,
    status: 'confirmed',
  }).returning();
  await db.insert(schema.entryCategories).values({ entryId: entry!.id, category: 'exercise', source: 'user' });
}

async function registerDevice(userId: string, token: string, locale: 'vi' | 'en' = 'vi') {
  await db.insert(schema.deviceTokens).values({ userId, token, platform: 'ios', locale });
}

describe('runNotifyJob', () => {
  it('sends nothing when no member has registered a device', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    const sender = fakeSender();
    expect(await runNotifyJob({ sender, now: NOW })).toEqual({ planned: 0, sent: 0, failed: 0, removedTokens: 0 });
    expect(sender.sent).toEqual([]);
  });

  it('sends an inactive_1d reminder to a member who last logged yesterday', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-1');
    const sender = fakeSender();

    const result = await runNotifyJob({ sender, now: NOW });
    expect(result).toMatchObject({ planned: 1, sent: 1, failed: 0, removedTokens: 0 });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ token: 'tok-1', data: { deepLink: 'track', kind: 'inactive_1d' } });
    expect(sender.sent[0]!.title).toBe('Hôm nay chưa ghi nhận gì?');
  });

  it('writes one notification_log row per member, not per device', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-1');
    await registerDevice(user.id, 'tok-2');
    const sender = fakeSender();

    const result = await runNotifyJob({ sender, now: NOW });
    expect(result.sent).toBe(2);
    const log = await db.select().from(schema.notificationLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ userId: user.id, kind: 'inactive_1d' });
    expect(log[0]!.payloadJson).toMatchObject({ locale: 'vi', vars: { days: 1 } });
  });

  it('renders the copy in users.locale, even when every device says otherwise', async () => {
    const { user } = await asUser('u', { activate: true });
    await db.update(schema.users).set({ locale: 'en' }).where(eq(schema.users.id, user.id));
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-vi', 'vi');
    const sender = fakeSender();

    await runNotifyJob({ sender, now: NOW });
    expect(sender.sent[0]!.title).toBe('Nothing logged today?');
    const log = await db.select().from(schema.notificationLog);
    expect(log[0]!.payloadJson).toMatchObject({ locale: 'en' });
  });

  it('defaults to vi: a fresh user with an en device is still reminded in Vietnamese', async () => {
    const { user } = await asUser('u', { activate: true });
    expect(user.locale).toBe('vi');
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-en', 'en');
    const sender = fakeSender();

    await runNotifyJob({ sender, now: NOW });
    expect(sender.sent[0]!.title).toBe('Hôm nay chưa ghi nhận gì?');
  });

  it('does not re-send the same kind within 24h', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-1');

    const first = fakeSender();
    await runNotifyJob({ sender: first, now: NOW });
    const second = fakeSender();
    const result = await runNotifyJob({ sender: second, now: new Date('2026-09-20T14:00:00Z') });

    expect(result.planned).toBe(0);
    expect(second.sent).toEqual([]);
    expect(await db.select().from(schema.notificationLog)).toHaveLength(1);
  });

  it('nudges the runner-up and leaves the leader alone', async () => {
    const leader = await asUser('lead', { activate: true, name: 'Khoa' });
    const second = await asUser('second', { activate: true, name: 'Minh' });
    // Both logged today, so no inactivity kind can fire; the leader is 3 points ahead.
    for (const d of ['2026-09-19', '2026-09-20']) await logExercise(leader.user.id, d);
    await logExercise(second.user.id, '2026-09-20');
    await registerDevice(leader.user.id, 'tok-lead');
    await registerDevice(second.user.id, 'tok-second');
    const sender = fakeSender();

    const result = await runNotifyJob({ sender, now: NOW });
    expect(result.planned).toBe(1);
    expect(sender.sent.map((m) => m.token)).toEqual(['tok-second']);
    expect(sender.sent[0]!.body).toBe('Còn 3 điểm là vượt Khoa.');
    const log = await db.select().from(schema.notificationLog);
    expect(log.map((r) => r.kind)).toEqual(['rank_nudge']);
  });

  it('ignores members who are not active', async () => {
    const pending = await asUser('p');
    await logExercise(pending.user.id, '2026-09-19');
    await registerDevice(pending.user.id, 'tok-pending');
    const sender = fakeSender();
    expect((await runNotifyJob({ sender, now: NOW })).planned).toBe(0);
  });

  it('deletes a token FCM reports as no longer registered', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-dead');
    await registerDevice(user.id, 'tok-live');
    const sender = fakeSender();
    sender.failures.set('tok-dead', { unregistered: true, error: 'not registered' });

    const result = await runNotifyJob({ sender, now: NOW });
    expect(result).toMatchObject({ planned: 1, sent: 1, failed: 1, removedTokens: 1 });
    const tokens = (await db.select().from(schema.deviceTokens)).map((r) => r.token);
    expect(tokens).toEqual(['tok-live']);
  });

  it('keeps a token that failed for any other reason, and logs nothing when nothing landed', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-flaky');
    const sender = fakeSender();
    sender.failures.set('tok-flaky', { unregistered: false, error: 'internal' });

    const result = await runNotifyJob({ sender, now: NOW });
    expect(result).toMatchObject({ planned: 1, sent: 0, failed: 1, removedTokens: 0 });
    expect(await db.select().from(schema.deviceTokens)).toHaveLength(1);
    // Nothing was delivered, so nothing is logged — tomorrow's run may try again.
    expect(await db.select().from(schema.notificationLog)).toHaveLength(0);
  });

  it('keeps going when FCM throws for one member, logging only the sends that landed', async () => {
    const a = await asUser('a', { activate: true, name: 'A' });
    const b = await asUser('b', { activate: true, name: 'B' });
    await logExercise(a.user.id, '2026-09-19');
    await logExercise(b.user.id, '2026-09-19');
    await registerDevice(a.user.id, 'tok-boom');
    await registerDevice(b.user.id, 'tok-fine');
    const inner = fakeSender();
    // fcmSender() rejects the whole batch on a network/auth failure; fakeSender never does.
    const sender: PushSender = {
      async send(messages) {
        if (messages.some((m) => m.token === 'tok-boom')) throw new Error('fcm down');
        return inner.send(messages);
      },
    };

    const result = await runNotifyJob({ sender, now: NOW });
    expect(result).toEqual({ planned: 2, sent: 1, failed: 1, removedTokens: 0 });
    expect(inner.sent.map((m) => m.token)).toEqual(['tok-fine']);
    const log = await db.select().from(schema.notificationLog);
    expect(log.map((r) => r.userId)).toEqual([b.user.id]);
    // A throw is not a "token not registered" signal, so the token survives for tomorrow.
    expect((await db.select().from(schema.deviceTokens)).map((r) => r.token).sort()).toEqual(['tok-boom', 'tok-fine']);
  });

  it('splits a member with many devices into send() batches of at most 500', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    const tokens = Array.from({ length: 501 }, (_, i) => `tok-${i}`);
    await db.insert(schema.deviceTokens).values(tokens.map((token) => ({ userId: user.id, token, platform: 'ios' as const, locale: 'vi' as const })));
    const inner = fakeSender();
    const batchSizes: number[] = [];
    const sender: PushSender = {
      async send(messages: PushMessage[]) {
        batchSizes.push(messages.length);
        return inner.send(messages);
      },
    };

    const result = await runNotifyJob({ sender, now: NOW });
    expect(batchSizes).toEqual([500, 1]);
    expect(result).toMatchObject({ planned: 1, sent: 501, failed: 0 });
    expect(await db.select().from(schema.notificationLog)).toHaveLength(1);
  });

  it('sends nothing after the challenge end date', async () => {
    const { user } = await asUser('u', { activate: true });
    await logExercise(user.id, '2026-09-19');
    await registerDevice(user.id, 'tok-1');
    const sender = fakeSender();
    const result = await runNotifyJob({ sender, now: new Date('2026-12-26T13:00:00Z') });
    expect(result.planned).toBe(0);
    expect(sender.sent).toEqual([]);
  });
});
