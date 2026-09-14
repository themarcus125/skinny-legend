import { describe, it, expect } from 'vitest';
import { RULEBOOK, projectedPoints, applyCaps, type ConfirmedEntry } from '../src/index.js';

describe('RULEBOOK', () => {
  it('is the challenge default the seed writes', () => {
    expect(RULEBOOK).toEqual([
      { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
      { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
      { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
    ]);
  });
});

describe('projectedPoints', () => {
  it('is zero for no categories', () => {
    expect(projectedPoints([], [])).toBe(0);
  });

  it('sums the rulebook points', () => {
    expect(projectedPoints(['exercise'], [])).toBe(3);
    expect(projectedPoints(['meal'], [])).toBe(2);
    expect(projectedPoints(['exercise', 'meal', 'group'], [])).toBe(8);
  });

  it('scores a capped category as zero', () => {
    expect(projectedPoints(['exercise', 'meal'], ['exercise'])).toBe(2);
    expect(projectedPoints(['exercise', 'meal'], ['exercise', 'meal'])).toBe(0);
  });

  it('counts a repeated category once', () => {
    expect(projectedPoints(['meal', 'meal'], [])).toBe(2);
  });

  it('agrees with applyCaps for an uncapped first entry of the day', () => {
    const entry: ConfirmedEntry = {
      id: 'e1', localDate: '2026-09-14', takenAt: new Date('2026-09-14T03:00:00.000Z'),
      categories: ['exercise', 'group'],
    };
    const scored = applyCaps([entry], [...RULEBOOK]);
    expect(scored.reduce((s, r) => s + r.points, 0)).toBe(projectedPoints(entry.categories, []));
  });
});
