import { and, eq, gte } from 'drizzle-orm';
import { renderNotification, schema, type SocialNotificationKind } from '@skinny/shared';
import { db } from '../db.js';
import { pushSender, sendInBatches, type PushMessage, type PushSender } from './push.js';

export interface SocialPushDeps {
  sender?: PushSender;
  /** Injected clock: the dedupe window and the log row must agree in tests. */
  now?: () => Date;
}

/** One push per recipient per entry per kind in this window (feed social spec §C). */
export const SOCIAL_DEDUPE_MS = 10 * 60 * 1000;

export interface SocialPushInput {
  entry: { id: string; userId: string };
  actor: { id: string; displayName: string };
  kind: SocialNotificationKind;
  /** Comment only: already passed through `commentExcerpt`. */
  excerpt?: string;
}

export interface SocialPushResult {
  sent: number;
  skipped: 'self' | 'deduped' | 'no_devices' | null;
}

/**
 * Tells an entry's owner that someone hearted or commented. Never throws: a push is a courtesy
 * on top of a write that has already committed, so a sender outage is logged and swallowed by
 * `sendInBatches`, and the route answers as if nothing happened.
 */
export async function notifyEntryOwner(input: SocialPushInput, deps: SocialPushDeps = {}): Promise<SocialPushResult> {
  const sender = deps.sender ?? pushSender;
  const now = deps.now?.() ?? new Date();
  if (input.actor.id === input.entry.userId) return { sent: 0, skipped: 'self' };

  try {
    const [recent] = await db.select({ id: schema.notificationLog.id }).from(schema.notificationLog).where(and(
      eq(schema.notificationLog.userId, input.entry.userId),
      eq(schema.notificationLog.kind, input.kind),
      eq(schema.notificationLog.entryId, input.entry.id),
      gte(schema.notificationLog.sentAt, new Date(now.getTime() - SOCIAL_DEDUPE_MS)),
    )).limit(1);
    if (recent) return { sent: 0, skipped: 'deduped' };

    const devices = await db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.userId, input.entry.userId));
    if (devices.length === 0) return { sent: 0, skipped: 'no_devices' };

    const [owner] = await db.select({ locale: schema.users.locale }).from(schema.users).where(eq(schema.users.id, input.entry.userId));
    const vars = { name: input.actor.displayName, ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}) };
    const { title, body } = renderNotification(input.kind, owner?.locale ?? 'vi', vars);
    const messages: PushMessage[] = devices.map((d) => ({
      token: d.token,
      title,
      body,
      data: { deepLink: 'feed', kind: input.kind, entryId: input.entry.id },
      platform: d.platform,
    }));

    const results = await sendInBatches(sender, input.entry.userId, messages);
    const sent = results.filter((r) => r.ok).length;
    if (sent > 0) {
      await db.insert(schema.notificationLog).values({
        userId: input.entry.userId,
        kind: input.kind,
        entryId: input.entry.id,
        payloadJson: { title, body, locale: owner?.locale ?? 'vi', vars },
        sentAt: now,
      });
    }
    return { sent, skipped: null };
  } catch (err) {
    // Bookkeeping — the dedupe read, the device and owner reads, the log write — is as optional
    // as the send: the heart or comment has already committed, so the route must not fail here.
    console.error(`social-push: ${input.kind} for entry ${input.entry.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    return { sent: 0, skipped: null };
  }
}
