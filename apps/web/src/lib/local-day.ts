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
