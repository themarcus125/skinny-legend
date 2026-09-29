import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { ChevronRightGlyph } from '@/app/icons';
import type { TrendsResponse } from '@skinny/shared/wire';
import type { Locale } from '@/i18n/locale';
import {
  WEEKDAY_KEYS,
  buildHeatGrid,
  heatLevel,
  heatmapCellLabel,
  pageHeatWeeks,
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
 * The ink for the points written on each step of the ramp. The top two steps are the `--primary`
 * end, so they take its foreground; the rest are light enough for the body ink.
 */
export const HEAT_INK: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'text-foreground-subtle',
  1: 'text-foreground',
  2: 'text-foreground',
  3: 'text-primary-foreground',
  4: 'text-primary-foreground',
};

const PAGER_BUTTON = cn(
  'text-foreground-secondary flex size-11 items-center justify-center rounded-full',
  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
  'disabled:text-foreground-subtle disabled:opacity-40',
);

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
 *
 * Each square carries the day's points as a number, so the ramp is a reinforcement and not the
 * only reading. The card shows four weeks at a time — the newest four first — and pages back
 * through the rest, so a long challenge does not push the rest of Xu hướng off the screen.
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
  const [requested, setRequested] = useState(0);
  const { weeks, page, pageCount, hasOlder, hasNewer } = pageHeatWeeks(
    buildHeatGrid(heatmap),
    requested,
  );
  const first = weeks[0];
  const last = weeks[weeks.length - 1];

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
                    'flex aspect-square w-full items-center justify-center rounded-md transition-transform',
                    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                    'hover:scale-105 active:scale-95',
                    HEAT_INK[level],
                  )}
                >
                  {/* Hidden from the name: `aria-label` already reads the points out in words. */}
                  <span
                    data-testid="heat-points"
                    aria-hidden="true"
                    className="type-caption font-semibold tabular-nums"
                  >
                    {cell.points}
                  </span>
                </button>
              );
            })}
          </li>
        ))}
      </ul>
      {pageCount > 1 && first && last ? (
        <div data-testid="heat-pager" data-page={page} className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={t('trends.olderWeeks')}
            disabled={!hasOlder}
            onClick={() => setRequested(page + 1)}
            className={PAGER_BUTTON}
          >
            <ChevronRightGlyph className="size-5 rotate-180" />
          </button>
          <span
            data-testid="heat-range"
            aria-live="polite"
            className="type-caption text-foreground-secondary font-semibold tabular-nums"
          >
            {/* Two catalog labels and a dash: nothing here for a translator to word. */}
            {`${weekAxisLabel(first.week, locale)} – ${weekAxisLabel(last.week, locale)}`}
          </span>
          <button
            type="button"
            aria-label={t('trends.newerWeeks')}
            disabled={!hasNewer}
            onClick={() => setRequested(page - 1)}
            className={PAGER_BUTTON}
          >
            <ChevronRightGlyph className="size-5" />
          </button>
        </div>
      ) : null}
      <p className="type-caption text-foreground-subtle pt-0.5">{t('trends.tapCell')}</p>
    </div>
  );
}
