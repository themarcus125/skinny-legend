import { describe, expect, it } from 'vitest';
import { challengeProgress, daysBetween, todayLocalDate } from './challenge-progress';

const START = '2026-09-08';
const END = '2026-12-25';

describe('challengeProgress', () => {
  it('reports day 0 and the full span before the start date', () => {
    expect(challengeProgress(START, END, '2026-09-01')).toEqual({
      day: 0,
      total: 109,
      remaining: 109,
      phase: 'before',
    });
  });

  it('counts the start date as day 1 and the days left inclusively', () => {
    expect(challengeProgress(START, END, START)).toMatchObject({ day: 1, phase: 'during' });
    expect(challengeProgress(START, END, '2026-09-11')).toEqual({
      day: 4,
      total: 109,
      remaining: 105,
      phase: 'during',
    });
  });

  it('clamps to the last day with nothing remaining after the end date', () => {
    expect(challengeProgress(START, END, '2027-01-10')).toEqual({
      day: 109,
      total: 109,
      remaining: 0,
      phase: 'after',
    });
  });

  it('never yields NaN or an empty span for malformed or inverted dates', () => {
    expect(challengeProgress('not-a-date', END, START)).toEqual({ day: 0, total: 1, remaining: 0, phase: 'before' });
    expect(challengeProgress(START, 'nope', START)).toEqual({ day: 0, total: 1, remaining: 0, phase: 'before' });
    // Inverted span: total clamps to 1, so the ratio stays finite and ≤ 100%.
    expect(challengeProgress(END, START, START)).toMatchObject({ total: 1, day: 0, phase: 'before' });
  });
});

describe('daysBetween', () => {
  it('counts whole days between two local dates', () => {
    expect(daysBetween(START, END)).toBe(108);
  });
});

describe('todayLocalDate', () => {
  it('formats an instant as a YYYY-MM-DD date in Asia/Ho_Chi_Minh', () => {
    // 23:30 UTC is already the next day in UTC+7.
    expect(todayLocalDate(new Date('2026-09-08T23:30:00.000Z'))).toBe('2026-09-09');
  });
});
