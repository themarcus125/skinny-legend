/**
 * Port of `LocalDay.display` (ios/SkinnyLegend/Core/Models/LocalDay.swift): the weekday in the
 * *display* language followed by `dd/MM`, e.g. "Monday, 14/09". The challenge calendar itself is
 * pinned to Asia/Ho_Chi_Minh for arithmetic (spec §2); a `LocalDate` is already that day's label,
 * so it is formatted in UTC here and never shifted by the reader's own zone.
 */
export function formatLocalDay(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return date;
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return date;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${weekday}, ${pad(day)}/${pad(month)}`;
}

/** The challenge clock (spec §2). Kept here, not imported from the provider, so this stays pure. */
const CHALLENGE_ZONE = 'Asia/Ho_Chi_Minh';

function challengeParts(iso: string): Record<string, string> | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CHALLENGE_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/**
 * An instant as the feed stamps it: `HH:mm · dd/MM` on the challenge clock, e.g. "21:24 · 28/09".
 * Numeric in every language, so it takes no locale — and it is read in Asia/Ho_Chi_Minh rather
 * than the reader's zone, so the date always agrees with the day heading the card sits under.
 */
export function formatEntryTime(iso: string): string {
  const parts = challengeParts(iso);
  if (!parts) return iso;
  return `${parts.hour}:${parts.minute} · ${parts.day}/${parts.month}`;
}

/** The challenge day (`YYYY-MM-DD`) an instant falls on — the client's `toLocalDate`. */
export function localDayOf(iso: string): string {
  const parts = challengeParts(iso);
  if (!parts) return iso;
  return `${parts.year}-${parts.month}-${parts.day}`;
}
