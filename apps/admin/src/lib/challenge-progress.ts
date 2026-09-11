import { CHALLENGE_TZ } from './format';

const DAY_MS = 86_400_000;
const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHALLENGE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's 'YYYY-MM-DD' in the challenge timezone. */
export function todayLocalDate(now: Date = new Date()): string {
  return YMD.format(now);
}

/** Whole days from a to b ('YYYY-MM-DD' strings, UTC midnight). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export interface ChallengeProgress {
  /** 0 before start, 1..total during, total after end. */
  day: number;
  /** Inclusive day count. */
  total: number;
  remaining: number;
  phase: 'before' | 'during' | 'after';
}

export function challengeProgress(
  startDate: string,
  endDate: string,
  today: string = todayLocalDate(),
): ChallengeProgress {
  // A malformed or inverted span must never yield NaN / ≤0 (the overview draws a bar from it).
  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) {
    return { day: 0, total: 1, remaining: 0, phase: 'before' };
  }
  const total = Math.max(daysBetween(startDate, endDate) + 1, 1);
  const raw = daysBetween(startDate, today) + 1;
  const phase = raw < 1 ? 'before' : raw > total ? 'after' : 'during';
  const day = Math.min(Math.max(raw, 0), total);
  return { day, total, remaining: Math.max(total - day, 0), phase };
}
