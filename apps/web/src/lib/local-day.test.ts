import { describe, expect, it } from 'vitest';
import { formatEntryTime, formatLocalDay, localDayOf } from './local-day';

describe('formatLocalDay', () => {
  it('reads as the weekday then dd/MM in the display language', () => {
    expect(formatLocalDay('2026-09-14', 'vi')).toBe('Thứ Hai, 14/09');
    expect(formatLocalDay('2026-09-14', 'en')).toBe('Monday, 14/09');
    expect(formatLocalDay('2026-09-15', 'vi')).toBe('Thứ Ba, 15/09');
  });

  it('pads both parts, so every row lines up', () => {
    expect(formatLocalDay('2026-01-05', 'en')).toBe('Monday, 05/01');
  });

  /**
   * A `LocalDate` is already the challenge day's label (spec §2 pins the calendar to
   * Asia/Ho_Chi_Minh), so the reader's own zone must not shift it — a UTC−11 machine would
   * otherwise render the day before.
   */
  it('never shifts the day by the reader zone', () => {
    const original = process.env.TZ;
    for (const zone of ['Pacific/Midway', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      expect(formatLocalDay('2026-09-14', 'en')).toBe('Monday, 14/09');
    }
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('falls back to the raw value when the date is not a LocalDate', () => {
    expect(formatLocalDay('', 'vi')).toBe('');
    expect(formatLocalDay('2026-09', 'vi')).toBe('2026-09');
    expect(formatLocalDay('hôm nay', 'vi')).toBe('hôm nay');
    expect(formatLocalDay('2026-xx-14', 'vi')).toBe('2026-xx-14');
  });
});

describe('formatEntryTime', () => {
  it('reads an instant as the challenge clock: HH:mm, then dd/MM', () => {
    // 14:24 UTC is 21:24 the same evening in Ho Chi Minh City.
    expect(formatEntryTime('2026-09-28T14:24:00.000Z')).toBe('21:24 · 28/09');
  });

  it('rolls the date over with the challenge clock, not the reader’s or UTC’s', () => {
    // 17:30 UTC on the 28th is already half past midnight on the 29th in Vietnam.
    expect(formatEntryTime('2026-09-28T17:30:00.000Z')).toBe('00:30 · 29/09');
  });

  it('hands back an unparseable value untouched', () => {
    expect(formatEntryTime('garbage')).toBe('garbage');
  });
});

describe('localDayOf', () => {
  it('names the challenge day an instant falls on', () => {
    expect(localDayOf('2026-09-28T15:28:12.252Z')).toBe('2026-09-28');
    expect(localDayOf('2026-09-28T17:30:00.000Z')).toBe('2026-09-29');
  });
});
