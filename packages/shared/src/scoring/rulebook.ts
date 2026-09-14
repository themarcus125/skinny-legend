import { type Category, type ScoringRule } from './types.js';

/**
 * The default scoring rules the challenge ships with — the same three rows
 * `apps/api/src/seed.ts` writes into `scoring_rules`. Clients use this to show a
 * points preview before the server has scored anything; the server always scores
 * from the rules actually stored for the challenge, which an admin may have edited.
 */
export const RULEBOOK: readonly ScoringRule[] = [
  { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
  { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
  { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
] as const;

/**
 * Points a set of categories would earn, given the categories whose cap is already
 * hit (which score zero). Duplicate categories only count once, matching `applyCaps`,
 * which awards a category at most once per entry.
 */
export function projectedPoints(categories: Category[], capped: Category[]): number {
  const cappedSet = new Set<Category>(capped);
  const counted = new Set<Category>();
  let total = 0;
  for (const category of categories) {
    if (counted.has(category) || cappedSet.has(category)) continue;
    counted.add(category);
    total += RULEBOOK.find((r) => r.category === category)?.points ?? 0;
  }
  return total;
}
