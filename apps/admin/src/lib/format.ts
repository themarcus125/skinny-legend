/** The challenge timezone is fixed server-side (spec §2). */
export const CHALLENGE_TZ = 'Asia/Ho_Chi_Minh';

const DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: CHALLENGE_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY'. localDate is already challenge-local; never shift it. */
export function formatLocalDate(localDate: string): string {
  const match = LOCAL_DATE.exec(localDate);
  if (!match) return localDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** ISO instant -> date + time in the challenge timezone. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** 0-1 confidence -> '82%', null -> '—'. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/**
 * Asia/Ho_Chi_Minh has been a fixed UTC+7 with no daylight saving since 1975, so the challenge
 * clock is an offset rather than a zone lookup. Used only to build form values.
 */
const CHALLENGE_OFFSET = '+07:00';
const CHALLENGE_OFFSET_MS = 7 * 60 * 60 * 1000;

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * ISO instant -> the `YYYY-MM-DDTHH:mm` a `datetime-local` field takes, read on the challenge
 * clock. The field has no zone of its own, so the admin always edits challenge time — never the
 * time their laptop happens to be set to.
 */
export function toChallengeInput(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  return new Date(instant.getTime() + CHALLENGE_OFFSET_MS).toISOString().slice(0, 16);
}

/** A `datetime-local` value -> an ISO instant on the challenge clock; null while it is incomplete. */
export function fromChallengeInput(value: string): string | null {
  return LOCAL_DATE_TIME.test(value) ? `${value}:00${CHALLENGE_OFFSET}` : null;
}
