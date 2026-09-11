import { describe, it, expect } from 'vitest';
import { computeStreak } from '../src/scoring/streak.js';
import { eachDay } from '../src/dates.js';

const challenge = { startDate: '2026-09-08', endDate: '2026-12-25', timezone: 'Asia/Ho_Chi_Minh', streakPoints: 5, streakLength: 7 };

describe('computeStreak', () => {
  it('awards 5 at 7 consecutive days', () => {
    const active = new Set(eachDay('2026-09-08', '2026-09-14'));
    const r = computeStreak(active, challenge, '2026-09-14');
    expect(r).toEqual({ current: 7, longest: 7, bonusesAwarded: 1, bonusPoints: 5 });
  });

  it('awards again at 14', () => {
    const active = new Set(eachDay('2026-09-08', '2026-09-21'));
    expect(computeStreak(active, challenge, '2026-09-21').bonusesAwarded).toBe(2);
  });

  it('resets on a missed day and keeps earlier bonus', () => {
    const active = new Set([...eachDay('2026-09-08', '2026-09-14'), ...eachDay('2026-09-16', '2026-09-18')]);
    const r = computeStreak(active, challenge, '2026-09-18');
    expect(r.current).toBe(3);
    expect(r.longest).toBe(7);
    expect(r.bonusesAwarded).toBe(1);
  });

  it('an empty today does not break the streak yet', () => {
    const active = new Set(eachDay('2026-09-08', '2026-09-10'));
    expect(computeStreak(active, challenge, '2026-09-11').current).toBe(3);
  });

  it('an empty yesterday does break it', () => {
    const active = new Set(eachDay('2026-09-08', '2026-09-10'));
    expect(computeStreak(active, challenge, '2026-09-12').current).toBe(0);
  });

  it('ignores days before startDate', () => {
    const active = new Set(eachDay('2026-09-01', '2026-09-09'));
    expect(computeStreak(active, challenge, '2026-09-09').current).toBe(2);
  });

  it('resets to 0 when asOf is past endDate and the final day was inactive', () => {
    const shortChallenge = { ...challenge, endDate: '2026-09-14' };
    const active = new Set(eachDay('2026-09-08', '2026-09-13'));
    const r = computeStreak(active, shortChallenge, '2026-10-05');
    expect(r).toEqual({ current: 0, longest: 6, bonusesAwarded: 0, bonusPoints: 0 });
  });

  it('returns all zeros when asOf is strictly before startDate', () => {
    const active = new Set(eachDay('2026-09-08', '2026-09-14'));
    const r = computeStreak(active, challenge, '2026-09-07');
    expect(r).toEqual({ current: 0, longest: 0, bonusesAwarded: 0, bonusPoints: 0 });
  });
});
