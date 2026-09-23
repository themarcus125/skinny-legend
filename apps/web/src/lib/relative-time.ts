export type RelativeTimeKey = 'time.now' | 'time.minutes' | 'time.hours' | 'time.days';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Which catalog string a timestamp reads as, relative to `now`: under a minute is "Vừa xong",
 * then whole minutes, hours and days up to a week. Beyond that the caller shows the date, so a
 * comment thread never says "43 ngày".
 */
export function relativeTimeKey(
  iso: string,
  now: Date,
): { key: RelativeTimeKey; value: number } | null {
  const delta = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (delta < MINUTE) return { key: 'time.now', value: 0 };
  if (delta < HOUR) return { key: 'time.minutes', value: Math.floor(delta / MINUTE) };
  if (delta < DAY) return { key: 'time.hours', value: Math.floor(delta / HOUR) };
  if (delta <= 7 * DAY) return { key: 'time.days', value: Math.floor(delta / DAY) };
  return null;
}
