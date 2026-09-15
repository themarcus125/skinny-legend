import { createTranslator } from 'use-intl';
import { MESSAGES, TIME_ZONE } from '@/i18n/provider';
import type { Locale } from '@/i18n/locale';
import { formatLocalDay } from '@/lib/local-day';

/** What `useTranslations()` hands a component, narrowed to what these helpers need. */
export type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

/**
 * Monday-first, matching the ISO weeks the server scores with — the same order and the same
 * catalog keys as `TrendsModel.weekdayLabels`
 * (ios/SkinnyLegend/Features/Trends/TrendsModel.swift), where the Vietnamese abbreviations
 * `T2…CN` double as the keys. The web catalog spells them `weekdays.mon…weekdays.sun`, so the
 * column order lives here and the text stays in the catalog: `T2` / `Mon`.
 */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * `weekAxisLabel` takes a `Locale` rather than a `t` because it is also called from the chart's
 * `tickFormatter`, which Recharts invokes outside React's render — there is no hook there. One
 * translator per locale, built on first use.
 */
const translators = new Map<Locale, Translate>();
function catalog(locale: Locale): Translate {
  const existing = translators.get(locale);
  if (existing) return existing;
  const made = createTranslator({
    locale,
    messages: MESSAGES[locale],
    timeZone: TIME_ZONE,
  }) as unknown as Translate;
  translators.set(locale, made);
  return made;
}

/**
 * `"2026-W38"` → the short week label the bar chart's X axis and the heatmap's row gutter show:
 * `T38` in Vietnamese, `W38` in English. Port of `TrendsModel.weekLabel`, which reads the same
 * `T%@` catalog entry (`trends.weekAxis` here).
 */
export function weekAxisLabel(week: string, locale: Locale): string {
  return catalog(locale)('trends.weekAxis', { 0: week.slice(-2) });
}

/** The heatmap's column heading for a Monday-first weekday index, e.g. `0` → `T2` / `Mon`. */
export function weekdayAxisLabel(index: number, t: Translate): string {
  return t(`weekdays.${WEEKDAY_KEYS[index % WEEKDAY_KEYS.length]}`);
}

/**
 * Five buckets — 0, 1–2, 3–4, 5–6, 7+ — mapped onto the token ramp by `HEAT_CLASS` below.
 * A day with no entry is its own level so "nothing happened" never reads as "a little".
 */
export function heatLevel(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points <= 0) return 0;
  if (points <= 2) return 1;
  if (points <= 4) return 2;
  if (points <= 6) return 3;
  return 4;
}

/**
 * A heatmap cell's accessible name: the day, then its points or "no activity" — the wording of
 * `TrendsModel.accessibilityLabel`, from the same two catalog entries. The grid is the only
 * route into the day sheet, so every cell has to name itself.
 */
export function heatmapCellLabel(
  date: string,
  points: number,
  locale: Locale,
  t: Translate,
): string {
  const day = formatLocalDay(date, locale);
  return points > 0
    ? t('trends.cellLabel', { 0: day, 1: points })
    : t('trends.cellLabelEmpty', { 0: day });
}

function utcDay(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

/** Monday-first index of a `LocalDate`: Monday `0` … Sunday `6`. */
export function weekdayIndex(date: string): number {
  return (utcDay(date).getUTCDay() + 6) % 7;
}

/**
 * `"2026-09-14"` → `"2026-W38"`, the same key `@skinny/shared/dates`' `isoWeekKey` produces on
 * the server. It is reimplemented here rather than imported because the web may only reach for
 * `@skinny/shared/wire` and `/scoring` (Task 2's contract), and `/dates` would drag `date-fns`
 * and `@date-fns/tz` into the shell for four lines of arithmetic. `axis-labels.test.ts` pins the
 * two against each other's known values.
 */
export function isoWeekKey(date: string): string {
  const thursday = utcDay(date);
  // The ISO week belongs to the year holding its Thursday.
  thursday.setUTCDate(thursday.getUTCDate() + 3 - weekdayIndex(date));
  const year = thursday.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const firstMonday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  const week = 1 + Math.round((thursday.getTime() - firstMonday) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export interface HeatCell {
  date: string;
  points: number;
  /** Monday `0` … Sunday `6` — the cell's column in the calendar grid. */
  weekday: number;
}

export interface HeatWeek {
  week: string;
  cells: HeatCell[];
}

/**
 * The heatmap's rows: the reported days grouped by ISO week, oldest week first, each week's
 * cells in date order. Where iOS fills every missing day in the window with a zero cell, the
 * web places each reported day in its weekday *column* instead — the calendar still lines up,
 * and the grid holds exactly one element per day the server actually reported.
 */
export function buildHeatGrid(heatmap: { date: string; points: number }[]): HeatWeek[] {
  const weeks = new Map<string, HeatCell[]>();
  for (const day of [...heatmap].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = isoWeekKey(day.date);
    const cells = weeks.get(key) ?? [];
    cells.push({ date: day.date, points: day.points, weekday: weekdayIndex(day.date) });
    weeks.set(key, cells);
  }
  return [...weeks].map(([week, cells]) => ({ week, cells }));
}
