import { describe, expect, it } from 'vitest';
import { formatLocalDay } from './local-day';

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
