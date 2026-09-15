import { useLocale, useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import type { TrendsResponse } from '@skinny/shared/wire';
import type { Locale } from '@/i18n/locale';
import {
  WEEKDAY_KEYS,
  buildHeatGrid,
  heatLevel,
  heatmapCellLabel,
  weekAxisLabel,
  weekdayAxisLabel,
} from './axis-labels';

/**
 * The five heat levels on the design-system ramp: `--track` for a day with nothing on it, then
 * `--primary-soft` warming to `--primary`. Every value is a token, so the ramp inverts with the
 * theme the way iOS's `Gradient([Theme.track, Theme.primarySoft, Theme.primary])` does — no
 * hard-coded green that turns into a smear on a dark card.
 *
 * `color-mix` rather than five more tokens: the two ends already exist, and the middle steps are
 * derived from them, so a token change cannot leave the ramp half-updated.
 */
export const HEAT_STYLE: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'var(--track)',
  1: 'var(--primary-soft)',
  2: 'color-mix(in oklab, var(--primary) 35%, var(--primary-soft))',
  3: 'color-mix(in oklab, var(--primary) 65%, var(--primary-soft))',
  4: 'var(--primary)',
};

/**
 * Ngày hoạt động — the active-days calendar. Port of `TrendsView.heatmap`
 * (ios/SkinnyLegend/Features/Trends/TrendsView.swift), where the Y axis is the ISO week and the
 * X axis the Monday-first weekday.
 *
 * Plan-writer's ruling: this is a CSS grid, not a chart. The data is a dense day grid whose
 * scale is already encoded by the token ramp, so a charting library would buy nothing and cost
 * a canvas the reader cannot tab into. Here each day is a real `<button>` inside a `<ul>`: it
 * is reachable by keyboard, it names itself (`heatmapCellLabel`, the wording of
 * `TrendsModel.accessibilityLabel`), and it opens the day sheet — which on iOS needs a separate
 * `accessibilityChildren` overlay precisely because a `Chart` is opaque to VoiceOver.
 */
export function Heatmap({
  heatmap,
  onSelectDay,
}: {
  heatmap: TrendsResponse['heatmap'];
  onSelectDay: (date: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const weeks = buildHeatGrid(heatmap);

  return (
    <div data-testid="heatmap" className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] items-center gap-1">
        {/* The row gutter has no heading of its own: the week label names each row. */}
        <span aria-hidden="true" />
        {WEEKDAY_KEYS.map((key, index) => (
          <span
            key={key}
            data-testid="heat-weekday"
            aria-hidden="true"
            className="type-caption text-foreground-secondary text-center font-semibold"
          >
            {weekdayAxisLabel(index, t)}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {weeks.map((row) => (
          <li
            key={row.week}
            data-testid="heat-week"
            data-week={row.week}
            className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] items-center gap-1"
          >
            <span
              data-testid="heat-week-label"
              aria-hidden="true"
              className="type-caption text-foreground-secondary font-semibold"
            >
              {weekAxisLabel(row.week, locale)}
            </span>
            {row.cells.map((cell) => {
              const level = heatLevel(cell.points);
              return (
                <button
                  key={cell.date}
                  type="button"
                  data-testid="heat-cell"
                  data-date={cell.date}
                  data-level={level}
                  data-points={cell.points}
                  aria-label={heatmapCellLabel(cell.date, cell.points, locale, t)}
                  onClick={() => onSelectDay(cell.date)}
                  style={{
                    // `gridColumnStart` places the day in its weekday column, so a week the
                    // server reported only three days for still lines up with the headings.
                    gridColumnStart: cell.weekday + 2,
                    backgroundColor: HEAT_STYLE[level],
                  }}
                  className={cn(
                    'aspect-square w-full rounded-md transition-transform',
                    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                    'hover:scale-105 active:scale-95',
                  )}
                />
              );
            })}
          </li>
        ))}
      </ul>
      <p className="type-caption text-foreground-subtle pt-0.5">{t('trends.tapCell')}</p>
    </div>
  );
}
