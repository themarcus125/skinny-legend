import type { LocalDate } from '../dates.js';
import { applyCaps } from './caps.js';
import { computeStreak } from './streak.js';
import { CATEGORIES, type Category, type ChallengeConfig, type ConfirmedEntry, type ScoreResult, type ScoringRule } from './types.js';
import { isoWeekKey } from '../dates.js';

export * from './types.js';
export { applyCaps } from './caps.js';
export { computeStreak } from './streak.js';
export { RULEBOOK, projectedPoints } from './rulebook.js';

const STREAK_CATEGORIES: readonly Category[] = ['exercise', 'meal'];

export function computeScore(input: {
  entries: ConfirmedEntry[];
  rules: ScoringRule[];
  challenge: ChallengeConfig;
  asOf: LocalDate;
}): ScoreResult {
  const { rules, challenge, asOf } = input;
  const entries = input.entries.filter((e) => e.localDate >= challenge.startDate && e.localDate <= challenge.endDate && e.localDate <= asOf);
  const scored = applyCaps(entries, rules);
  const dateById = new Map(entries.map((e) => [e.id, e.localDate]));

  const byCategory: Record<Category, number> = { exercise: 0, meal: 0, group: 0 };
  const byDay: ScoreResult['byDay'] = {};
  const activeDays = new Set<LocalDate>();

  for (const s of scored) {
    const day = dateById.get(s.entryId)!;
    byCategory[s.category] += s.points;
    const d = (byDay[day] ??= { points: 0, categories: [] });
    d.points += s.points;
    if (!d.categories.includes(s.category)) d.categories.push(s.category);
    if (s.points > 0 && STREAK_CATEGORIES.includes(s.category)) activeDays.add(day);
  }

  const streak = computeStreak(activeDays, challenge, asOf);
  const total = byCategory.exercise + byCategory.meal + byCategory.group + streak.bonusPoints;

  const capsHit = { exercise: false, meal: false, group: false } as Record<Category, boolean>;
  for (const rule of rules) {
    const periodKey = rule.capPeriod === 'day' ? asOf : isoWeekKey(asOf);
    const count = scored.filter((s) => {
      if (s.category !== rule.category || s.points === 0) return false;
      const day = dateById.get(s.entryId)!;
      return (rule.capPeriod === 'day' ? day : isoWeekKey(day)) === periodKey;
    }).length;
    capsHit[rule.category] = count >= rule.capCount;
  }
  for (const c of CATEGORIES) capsHit[c] ??= false;

  return { total, byCategory, streakBonus: streak.bonusPoints, byDay, scored, streak, capsHit };
}
