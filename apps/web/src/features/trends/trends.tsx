import { Suspense, lazy, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { CATEGORIES } from '@skinny/shared/scoring';
import { AlertBanner, CategoryChip, EmptyState, SurfaceCard } from '@skinny/ui';
import { ChartGlyph, FlameGlyph } from '@/app/icons';
import { LargeTitle } from '@/app/large-title';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';
import { DaySheet } from './day-sheet';
import { Heatmap } from './heatmap';

/**
 * Recharts is ~90 KB of the Trends chunk and nothing else in the app uses it, so the bar chart
 * sits behind its own `React.lazy` boundary: the route's chunk (and its shell) paints the title,
 * the heatmap and the totals while the chart module is still in flight.
 */
const WeeklyBars = lazy(() => import('./weekly-bars'));

/**
 * Xu hướng — the trends screen. Port of `TrendsView`
 * (ios/SkinnyLegend/Features/Trends/TrendsView.swift): weekly points as "Bạn" against the group
 * average, the active-days calendar, and the per-category totals with the streak bonus.
 *
 * Two deliberate departures from iOS:
 *
 * * **The heatmap is a CSS grid, not a chart** (plan-writer's ruling). The day grid's scale is
 *   the token ramp, and real `<button>` cells are keyboard-reachable and self-naming — where
 *   iOS has to bolt an `accessibilityChildren` overlay onto an opaque `Chart` to get the same.
 * * **No rank-over-time line.** A five-point line over eight weeks on a phone is a sparkline of
 *   noise, and the leaderboard is one tab away. `weeks[].rank` is carried by the DTO and simply
 *   not drawn.
 */
export function Trends() {
  const t = useTranslations();
  const api = useApi();
  const [day, setDay] = useState<string | null>(null);

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.trends,
    queryFn: () => api.trends(),
  });

  /** Nothing scored anywhere: no weeks, no days. The seeded group always has both. */
  const empty =
    data !== undefined && data.weeks.length === 0 && data.heatmap.length === 0;

  return (
    <>
      <LargeTitle title={t('trends.title')} />
      <div className="flex flex-col gap-3.5 px-4 pt-2 pb-8">
        {error ? (
          <AlertBanner
            tone="destructive"
            title={t('trends.loadFailed')}
            description={t(describeError(error))}
            action={
              <Button size="sm" variant="secondary" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}

        {isPending ? (
          <div
            data-testid="trends-skeleton"
            aria-busy="true"
            className="bg-surface-2 h-[220px] animate-pulse rounded-xl"
          />
        ) : null}

        {empty ? <EmptyState icon={<ChartGlyph className="size-8" />} title={t('trends.empty')} /> : null}

        {data && !empty ? (
          <>
            <SurfaceCard as="section" className="flex flex-col gap-3">
              <h2 className="type-label text-foreground-secondary">{t('trends.pointsByWeek')}</h2>
              <Suspense
                fallback={
                  <div
                    data-testid="bars-fallback"
                    aria-busy="true"
                    className="bg-surface-2 h-[190px] animate-pulse rounded-xl"
                  />
                }
              >
                <WeeklyBars weeks={data.weeks} />
              </Suspense>
            </SurfaceCard>

            <SurfaceCard as="section" className="flex flex-col gap-3">
              <h2 className="type-label text-foreground-secondary">{t('trends.activeDays')}</h2>
              {data.heatmap.length === 0 ? (
                /* Weeks but no days: the grid would be an empty box with axis headings. */
                <p className="type-caption text-foreground-subtle">{t('trends.noActivity')}</p>
              ) : (
                <Heatmap heatmap={data.heatmap} onSelectDay={setDay} />
              )}
            </SurfaceCard>

            <SurfaceCard as="section" className="flex flex-col gap-3">
              <h2 className="type-label text-foreground-secondary">
                {t('trends.pointsByCategory')}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {CATEGORIES.map((category) => (
                  <li
                    key={category}
                    data-testid="category-total"
                    data-category={category}
                    className="flex items-center justify-between gap-3"
                  >
                    <CategoryChip category={category} label={t(`categories.${category}`)} />
                    <span className="type-h3 tabular-nums">{data.byCategory[category]}</span>
                  </li>
                ))}
              </ul>
              <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
                <span className="type-caption text-foreground-secondary flex items-center gap-1.5">
                  <FlameGlyph className="size-4" />
                  {t('track.streakBonus')}
                </span>
                <span data-testid="streak-bonus" className="type-h3 tabular-nums">
                  {data.streakBonus}
                </span>
              </div>
            </SurfaceCard>
          </>
        ) : null}
      </div>

      {day ? <DaySheet date={day} onDismiss={() => setDay(null)} /> : null}
    </>
  );
}

/** React Router 7's lazy-route convention. */
export const Component = Trends;
