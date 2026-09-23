import { describe, expect, it } from 'vitest';
import { relativeTimeKey } from './relative-time';

const NOW = new Date('2026-09-22T10:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTimeKey', () => {
  it('buckets by minutes, hours and days', () => {
    expect(relativeTimeKey(ago(30_000), NOW)).toEqual({ key: 'time.now', value: 0 });
    expect(relativeTimeKey(ago(5 * 60_000), NOW)).toEqual({ key: 'time.minutes', value: 5 });
    expect(relativeTimeKey(ago(3 * 3_600_000), NOW)).toEqual({ key: 'time.hours', value: 3 });
    expect(relativeTimeKey(ago(2 * 86_400_000), NOW)).toEqual({ key: 'time.days', value: 2 });
  });

  it('hands anything older than seven days back for a date', () => {
    expect(relativeTimeKey(ago(7 * 86_400_000 + 1), NOW)).toBeNull();
    expect(relativeTimeKey(ago(7 * 86_400_000), NOW)).toEqual({ key: 'time.days', value: 7 });
  });

  it('treats a clock ahead of the server as now', () => {
    expect(relativeTimeKey(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toEqual({
      key: 'time.now',
      value: 0,
    });
  });
});
