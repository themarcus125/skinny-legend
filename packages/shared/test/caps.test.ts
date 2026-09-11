import { describe, it, expect } from 'vitest';
import { applyCaps } from '../src/scoring/caps.js';
import type { ConfirmedEntry, ScoringRule } from '../src/scoring/types.js';

const rules: ScoringRule[] = [
  { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
  { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
  { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
];

function e(id: string, localDate: string, hour: number, categories: ConfirmedEntry['categories']): ConfirmedEntry {
  return { id, localDate, takenAt: new Date(`${localDate}T${String(hour).padStart(2, '0')}:00:00+07:00`), categories };
}

describe('applyCaps', () => {
  it('scores first exercise of the day, caps the second', () => {
    const out = applyCaps([e('a', '2026-09-08', 7, ['exercise']), e('b', '2026-09-08', 18, ['exercise'])], rules);
    expect(out).toEqual([
      { entryId: 'a', category: 'exercise', points: 3, capped: false },
      { entryId: 'b', category: 'exercise', points: 0, capped: true },
    ]);
  });

  it('orders by takenAt, not by input order', () => {
    const out = applyCaps([e('late', '2026-09-08', 18, ['exercise']), e('early', '2026-09-08', 7, ['exercise'])], rules);
    expect(out.find((s) => s.entryId === 'early')?.points).toBe(3);
    expect(out.find((s) => s.entryId === 'late')?.points).toBe(0);
  });

  it('stacks exercise + group on one entry', () => {
    const out = applyCaps([e('a', '2026-09-08', 7, ['exercise', 'group'])], rules);
    expect(out.map((s) => s.points)).toEqual([3, 3]);
  });

  it('caps group at 2 per ISO week and resets on Monday', () => {
    const out = applyCaps(
      [
        e('a', '2026-09-08', 7, ['group']), // Tue
        e('b', '2026-09-10', 7, ['group']), // Thu
        e('c', '2026-09-13', 7, ['group']), // Sun, capped
        e('d', '2026-09-14', 7, ['group']), // Mon, new week
      ],
      rules,
    );
    expect(out.map((s) => [s.entryId, s.points])).toEqual([['a', 3], ['b', 3], ['c', 0], ['d', 3]]);
  });

  it('day cap resets the next day', () => {
    const out = applyCaps([e('a', '2026-09-08', 7, ['meal']), e('b', '2026-09-09', 7, ['meal'])], rules);
    expect(out.map((s) => s.points)).toEqual([2, 2]);
  });

  it('ignores categories with no rule', () => {
    const out = applyCaps([{ ...e('a', '2026-09-08', 7, []), categories: ['exercise'] }], [rules[1]!]);
    expect(out).toEqual([]);
  });
});
