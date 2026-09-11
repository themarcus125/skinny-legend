import { isoWeekKey } from '../dates.js';
import type { ConfirmedEntry, ScoredCategory, ScoringRule } from './types.js';

export function applyCaps(entries: ConfirmedEntry[], rules: ScoringRule[]): ScoredCategory[] {
  const sorted = [...entries].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const ruleByCat = new Map(rules.map((r) => [r.category, r]));
  const usage = new Map<string, number>(); // `${category}:${periodKey}` -> count
  const out: ScoredCategory[] = [];

  for (const entry of sorted) {
    for (const category of entry.categories) {
      const rule = ruleByCat.get(category);
      if (!rule) continue;
      const periodKey = rule.capPeriod === 'day' ? entry.localDate : isoWeekKey(entry.localDate);
      const key = `${category}:${periodKey}`;
      const used = usage.get(key) ?? 0;
      const capped = used >= rule.capCount;
      usage.set(key, used + 1);
      out.push({ entryId: entry.id, category, points: capped ? 0 : rule.points, capped });
    }
  }
  return out;
}
