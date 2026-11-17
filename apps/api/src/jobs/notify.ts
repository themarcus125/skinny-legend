import { gte, inArray } from 'drizzle-orm';
import {
  planNotifications,
  schema,
  toLocalDate,
  type ConfirmedEntry,
  type LeaderboardStanding,
  type LocalDate,
  type NotificationLogEntry,
  type NotificationVars,
  type PlannerUser,
} from '@skinny/shared';
import { db } from '../db.js';
import { loadChallenge, loadConfirmedEntries, loadScoreboard } from '../services/score.js';
import { localeFor, pushSender, sendInBatches, type PushMessage, type PushSender } from '../services/push.js';

export interface NotifyResult {
  planned: number;
  sent: number;
  failed: number;
  removedTokens: number;
}

type DeviceRow = typeof schema.deviceTokens.$inferSelect;

/** The planner's dedupe window; the query only needs to reach back that far. */
const LOG_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** The most recent day this member confirmed anything, or null if they never have. */
function lastConfirmedDate(entries: ConfirmedEntry[], today: LocalDate): LocalDate | null {
  let latest: LocalDate | null = null;
  for (const e of entries) {
    if (e.localDate <= today && (latest === null || e.localDate > latest)) latest = e.localDate;
  }
  return latest;
}

/** `payload_json.vars` is a plain string/number map; drop the keys the planner left unset. */
function jsonVars(vars: NotificationVars): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * The daily reminder run (spec §E). Fans each planned notification out to every device the
 * member has registered, logs one row per member who actually received something, and drops
 * tokens FCM reports as dead. Locale comes from `users.locale` (the language the member picked
 * in the app), falling back to `localeFor` from services/push only when the row has none. Shared
 * with the admin test-send route so both surfaces pick the same language.
 */
export async function runNotifyJob(deps: { sender?: PushSender; now?: Date } = {}): Promise<NotifyResult> {
  const sender = deps.sender ?? pushSender;
  const now = deps.now ?? new Date();
  const challenge = await loadChallenge();
  const today = toLocalDate(now, challenge.config.timezone);

  const devices = await db.select().from(schema.deviceTokens);
  const tokensByUser = new Map<string, DeviceRow[]>();
  for (const d of devices) {
    const list = tokensByUser.get(d.userId) ?? [];
    list.push(d);
    tokensByUser.set(d.userId, list);
  }
  if (tokensByUser.size === 0) return { planned: 0, sent: 0, failed: 0, removedTokens: 0 };

  const board = await loadScoreboard(challenge, today);
  const leaderboard: LeaderboardStanding[] = board.map((r) => ({
    userId: r.user.id,
    displayName: r.user.displayName,
    rank: r.rank,
    total: r.score.total,
  }));
  const entriesByUser = await loadConfirmedEntries(board.map((r) => r.user.id));

  // Only members with a device can be reminded; the rest still count towards the standings.
  const users: PlannerUser[] = board
    .filter((r) => tokensByUser.has(r.user.id))
    .map((r) => ({
      userId: r.user.id,
      lastConfirmedDate: lastConfirmedDate(entriesByUser.get(r.user.id) ?? [], today),
      rank: r.rank,
      total: r.score.total,
      // users.locale is NOT NULL (default 'vi'), so the column always wins in practice; the
      // device-locale fallback only guards a row read without it.
      locale: r.user.locale ?? localeFor(tokensByUser.get(r.user.id)!),
    }));

  const log: NotificationLogEntry[] = await db
    .select({
      userId: schema.notificationLog.userId,
      kind: schema.notificationLog.kind,
      sentAt: schema.notificationLog.sentAt,
    })
    .from(schema.notificationLog)
    .where(gte(schema.notificationLog.sentAt, new Date(now.getTime() - LOG_LOOKBACK_MS)));

  const plan = planNotifications({ users, leaderboard, log, today, now, challenge: challenge.config });

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  for (const p of plan) {
    const messages: PushMessage[] = (tokensByUser.get(p.userId) ?? []).map((d) => ({
      token: d.token,
      title: p.title,
      body: p.body,
      data: { deepLink: 'track', kind: p.kind },
      // The device row decides the wire shape: web tokens go out data-only (see `fcmSender`).
      platform: d.platform,
    }));
    const results = await sendInBatches(sender, p.userId, messages);
    for (const r of results) {
      if (r.ok) sent += 1;
      else {
        failed += 1;
        if (r.unregistered) dead.push(r.token);
      }
    }
    // Log only when something actually landed: a run that failed on every device must not
    // suppress tomorrow's attempt through the 24h dedupe rule.
    if (results.some((r) => r.ok)) {
      await db.insert(schema.notificationLog).values({
        userId: p.userId,
        kind: p.kind,
        payloadJson: { title: p.title, body: p.body, locale: p.locale, vars: jsonVars(p.vars) },
        // Explicit, not defaultNow(): the dedupe window is measured against the injected
        // `now`, so the column has to agree with it or a test clock would never dedupe.
        sentAt: now,
      });
    }
  }

  if (dead.length > 0) {
    await db.delete(schema.deviceTokens).where(inArray(schema.deviceTokens.token, dead));
  }

  return { planned: plan.length, sent, failed, removedTokens: dead.length };
}

// CLI entry point, mirroring jobs/cleanup.ts.
if (process.argv[1]?.endsWith('notify.ts') || process.argv[1]?.endsWith('notify.js')) {
  const r = await runNotifyJob();
  console.log(`notify: planned ${r.planned}, sent ${r.sent}, failed ${r.failed}, removed ${r.removedTokens} dead tokens`);
  process.exit(0);
}
