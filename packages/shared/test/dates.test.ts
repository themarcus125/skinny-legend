import { describe, it, expect } from 'vitest';
import { toLocalDate, isoWeekKey, addDays, eachDay } from '../src/dates.js';

const TZ = 'Asia/Ho_Chi_Minh';

describe('toLocalDate', () => {
  it('maps 23:30 UTC to the next day in Vietnam (UTC+7)', () => {
    expect(toLocalDate(new Date('2026-09-10T23:30:00Z'), TZ)).toBe('2026-09-11');
  });
  it('maps 16:59 UTC to the same day', () => {
    expect(toLocalDate(new Date('2026-09-10T16:59:00Z'), TZ)).toBe('2026-09-10');
  });
  it('maps 17:00 UTC to the next day', () => {
    expect(toLocalDate(new Date('2026-09-10T17:00:00Z'), TZ)).toBe('2026-09-11');
  });
});

describe('isoWeekKey', () => {
  it('Sunday 2026-09-13 and Monday 2026-09-14 are different weeks', () => {
    expect(isoWeekKey('2026-09-13')).toBe('2026-W37');
    expect(isoWeekKey('2026-09-14')).toBe('2026-W38');
  });
  it('Monday and following Sunday share a week', () => {
    expect(isoWeekKey('2026-09-14')).toBe(isoWeekKey('2026-09-20'));
  });
});

describe('addDays / eachDay', () => {
  it('adds across month end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
  it('lists inclusive range', () => {
    expect(eachDay('2026-09-08', '2026-09-10')).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
  });
});
