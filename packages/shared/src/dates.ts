import { TZDate } from '@date-fns/tz';
import { format, getISOWeek, getISOWeekYear, parseISO, addDays as dfAddDays } from 'date-fns';

export type LocalDate = string; // YYYY-MM-DD

export function toLocalDate(instant: Date, tz: string): LocalDate {
  return format(new TZDate(instant, tz), 'yyyy-MM-dd');
}

export function isoWeekKey(date: LocalDate): string {
  const d = parseISO(date);
  const week = String(getISOWeek(d)).padStart(2, '0');
  return `${getISOWeekYear(d)}-W${week}`;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  return format(dfAddDays(parseISO(date), n), 'yyyy-MM-dd');
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
