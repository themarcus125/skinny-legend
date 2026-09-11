import { describe, it, expect } from 'vitest';
import { computeScore } from '../src/scoring/index.js';
import type { ConfirmedEntry, ScoringRule } from '../src/scoring/types.js';

const rules: ScoringRule[] = [
  { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
  { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
  { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
];
const challenge = { startDate: '2026-09-08', endDate: '2026-12-25', timezone: 'Asia/Ho_Chi_Minh', streakPoints: 5, streakLength: 7 };

function e(id: string, localDate: string, categories: ConfirmedEntry['categories']): ConfirmedEntry {
  return { id, localDate, takenAt: new Date(`${localDate}T08:00:00+07:00`), categories };
}

describe('computeScore', () => {
  it('sums categories and streak bonus', () => {
    const entries = ['08', '09', '10', '11', '12', '13', '14'].map((d) => e(d, `2026-09-${d}`, ['exercise', 'meal']));
    const r = computeScore({ entries, rules, challenge, asOf: '2026-09-14' });
    expect(r.byCategory).toEqual({ exercise: 21, meal: 14, group: 0 });
    expect(r.streakBonus).toBe(5);
    expect(r.total).toBe(40);
    expect(r.byDay['2026-09-14']).toEqual({ points: 5, categories: ['exercise', 'meal'] });
  });

  it('group-only day does not count as an active streak day', () => {
    const entries = [e('a', '2026-09-08', ['exercise']), e('b', '2026-09-09', ['group']), e('c', '2026-09-10', ['exercise'])];
    const r = computeScore({ entries, rules, challenge, asOf: '2026-09-10' });
    expect(r.streak.current).toBe(1);
  });

  it('a capped entry does not make a day active', () => {
    const entries = [e('a', '2026-09-08', ['exercise']), e('b', '2026-09-09', ['exercise']), e('c', '2026-09-09', ['exercise'])];
    const r = computeScore({ entries, rules, challenge, asOf: '2026-09-09' });
    expect(r.byDay['2026-09-09']?.points).toBe(3);
    expect(r.streak.current).toBe(2);
  });

  it('excludes entries outside the challenge window', () => {
    const r = computeScore({ entries: [e('a', '2026-09-07', ['exercise'])], rules, challenge, asOf: '2026-09-08' });
    expect(r.total).toBe(0);
  });

  it('reports capsHit for asOf day and week', () => {
    const entries = [e('a', '2026-09-08', ['exercise', 'group']), e('b', '2026-09-09', ['group'])];
    const r = computeScore({ entries, rules, challenge, asOf: '2026-09-09' });
    expect(r.capsHit).toEqual({ exercise: false, meal: false, group: true });
  });
});
