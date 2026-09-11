import { and, eq, inArray } from 'drizzle-orm';
import { computeScore, toLocalDate, schema, type ChallengeConfig, type ConfirmedEntry, type ScoreResult, type ScoringRule, type LocalDate, type Category } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';

export interface Challenge { id: string; config: ChallengeConfig; rules: ScoringRule[] }

export async function loadChallenge(): Promise<Challenge> {
  const [c] = await db.select().from(schema.challenges).limit(1);
  if (!c) throw new ApiError(500, 'no_challenge', 'No challenge configured');
  const rules = await db.select().from(schema.scoringRules).where(eq(schema.scoringRules.challengeId, c.id));
  return {
    id: c.id,
    config: { startDate: c.startDate, endDate: c.endDate, timezone: c.timezone, streakPoints: c.streakPoints, streakLength: c.streakLength },
    rules: rules.map((r) => ({ category: r.category, points: r.points, capCount: r.capCount, capPeriod: r.capPeriod })),
  };
}

export function todayLocal(config: ChallengeConfig): LocalDate {
  return toLocalDate(new Date(), config.timezone);
}

/** Loads confirmed entries for the given users, grouped by user id. */
export async function loadConfirmedEntries(userIds: string[]): Promise<Map<string, ConfirmedEntry[]>> {
  const out = new Map<string, ConfirmedEntry[]>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ id: schema.entries.id, userId: schema.entries.userId, localDate: schema.entries.localDate, takenAt: schema.entries.takenAt, category: schema.entryCategories.category })
    .from(schema.entries)
    .leftJoin(schema.entryCategories, eq(schema.entryCategories.entryId, schema.entries.id))
    .where(and(inArray(schema.entries.userId, userIds), eq(schema.entries.status, 'confirmed')));
  const byId = new Map<string, ConfirmedEntry & { userId: string }>();
  for (const r of rows) {
    let e = byId.get(r.id);
    if (!e) { e = { id: r.id, userId: r.userId, localDate: r.localDate, takenAt: r.takenAt, categories: [] }; byId.set(r.id, e); }
    if (r.category) e.categories.push(r.category as Category);
  }
  for (const e of byId.values()) (out.get(e.userId) ?? out.set(e.userId, []).get(e.userId)!).push(e);
  return out;
}

export async function loadUserScore(userId: string, challenge: Challenge, asOf: LocalDate = todayLocal(challenge.config)): Promise<ScoreResult> {
  const entries = (await loadConfirmedEntries([userId])).get(userId) ?? [];
  return computeScore({ entries, rules: challenge.rules, challenge: challenge.config, asOf });
}
