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
