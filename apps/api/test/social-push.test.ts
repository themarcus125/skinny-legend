import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { fakeSender } from '../src/services/push.js';
import { notifyEntryOwner, SOCIAL_DEDUPE_MS } from '../src/services/social-push.js';
import { resetDb, asUser, challengeId } from './helpers.js';

const NOW = new Date('2026-09-22T10:00:00Z');

async function confirmedEntry(userId: string) {
  const [row] = await db.insert(schema.entries).values({
    userId, challengeId: await challengeId(), photoKey: `photos/${userId}/x.jpg`,
    takenAt: NOW, localDate: '2026-09-22', status: 'confirmed',
  }).returning();
  return row!;
}

beforeEach(resetDb);

describe('notifyEntryOwner', () => {
  it('sends one message per device of the owner, in their locale, and logs the entry', async () => {
    const owner = (await asUser('owner', { activate: true, name: 'Khoa' })).user;
    const actor = (await asUser('actor', { activate: true, name: 'Linh' })).user;
    await db.insert(schema.deviceTokens).values([
      { userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' },
      { userId: owner.id, token: 't2', platform: 'web', locale: 'vi' },
    ]);
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();

    const result = await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW });

    expect(result).toEqual({ sent: 2, skipped: null });
    expect(sender.sent.map((m) => m.token).sort()).toEqual(['t1', 't2']);
    expect(sender.sent[0]).toMatchObject({
      title: 'Linh đã thả tim',
      data: { deepLink: 'feed', kind: 'heart', entryId: entry.id },
    });
    const log = await db.select().from(schema.notificationLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ userId: owner.id, kind: 'heart', entryId: entry.id, sentAt: NOW });
  });

  it('renders in the owner\'s users.locale, not the device locale', async () => {
    const owner = (await asUser('owner', { activate: true, name: 'Khoa' })).user;
    const actor = (await asUser('actor', { activate: true, name: 'Linh' })).user;
    await db.update(schema.users).set({ locale: 'en' }).where(eq(schema.users.id, owner.id));
    // The device disagrees with the account: the account has to win.
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();

    expect(await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW })).toEqual({ sent: 1, skipped: null });
    expect(sender.sent[0]).toMatchObject({ title: 'Linh sent a heart' });
    const [log] = await db.select().from(schema.notificationLog);
    expect(log!.payloadJson).toMatchObject({ locale: 'en', title: 'Linh sent a heart' });
  });

  it('is silent when the actor owns the entry', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();
    expect(await notifyEntryOwner({ entry, actor: owner, kind: 'heart' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: 'self' });
    expect(sender.sent).toHaveLength(0);
  });

  it('dedupes the same kind on the same entry within ten minutes, and sends again after', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true, name: 'Linh' })).user;
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();

    await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW });
    const soon = new Date(NOW.getTime() + 5 * 60 * 1000);
    expect(await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => soon })).toEqual({ sent: 0, skipped: 'deduped' });
    // A different kind on the same entry is not deduped against the heart.
    expect((await notifyEntryOwner({ entry, actor, kind: 'comment', excerpt: 'Hay' }, { sender, now: () => soon })).sent).toBe(1);
    // The excerpt the route computed travels into the rendered body, in curly quotes.
    expect(sender.sent.at(-1)).toMatchObject({
      body: '“Hay”',
      data: { deepLink: 'feed', kind: 'comment', entryId: entry.id },
    });
    const later = new Date(NOW.getTime() + SOCIAL_DEDUPE_MS + 1000);
    expect((await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => later })).sent).toBe(1);
    expect(sender.sent).toHaveLength(3);
  });

  it('reports no_devices and logs nothing when the owner has no token', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true })).user;
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();
    expect(await notifyEntryOwner({ entry, actor, kind: 'comment', excerpt: 'x' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: 'no_devices' });
    expect(await db.select().from(schema.notificationLog)).toHaveLength(0);
  });

  it('swallows a database failure instead of failing its caller', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true })).user;
    const sender = fakeSender();
    // An id Postgres cannot even parse: the dedupe SELECT throws before anything is sent, which
    // is the shape of every bookkeeping failure the route must survive.
    const entry = { id: 'not-a-uuid', userId: owner.id };

    expect(await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: null });
    expect(sender.sent).toHaveLength(0);
  });

  it('does not log when every device failed, so the next attempt is not deduped away', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true })).user;
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 'dead', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();
    sender.failures.set('dead', { unregistered: false, error: 'boom' });
    expect(await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: null });
    expect(await db.select().from(schema.notificationLog)).toHaveLength(0);
  });
});
