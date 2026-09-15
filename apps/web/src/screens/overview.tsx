import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import type { Category } from '@skinny/shared/wire';
import { RULEBOOK } from '@skinny/shared/scoring';
import { AlertBanner, CategoryChip, StreakCounter, SurfaceCard, cn, filledDots } from '@skinny/ui';
import { ChevronRightGlyph } from '@/app/icons';
import { LargeTitle } from '@/app/large-title';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';

/** The order the checklist and the chips read in — the rulebook's, so iOS and web agree. */
const CATEGORY_ORDER: readonly Category[] = RULEBOOK.map((rule) => rule.category);

/**
 * Tổng quan — the dashboard. Port of `DashboardView`
 * (ios/SkinnyLegend/Features/Dashboard/DashboardView.swift): today's points and the delta vs
 * yesterday, the streak counter, the rank, the "still scorable today" checklist, the accent
 * card with the challenge total, and a link into the group feed.
 */
export function Overview() {
  const t = useTranslations();
  const api = useApi();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.dashboard(),
  });

  return (
    <>
      <LargeTitle title={t('overview.title')} />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
        {isPending ? <OverviewSkeleton /> : null}
        {error ? (
          <AlertBanner
            tone="destructive"
            title={t('overview.loadFailed')}
            description={t(describeError(error))}
            action={
              <Button size="sm" variant="secondary" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}
        {data ? (
          <>
            <TodayCard
              points={data.today.points}
              delta={data.deltaVsYesterday}
              categories={data.today.categories}
            />
            <div className="grid grid-cols-2 gap-4">
              <StreakCard current={data.streak.current} longest={data.streak.longest} />
              <RankCard rank={data.rank} memberCount={data.memberCount} />
            </div>
            <ChecklistCard capsHit={data.capsHit} />
            <TotalCard total={data.total} bonusPoints={data.streak.bonusPoints} />
            <FeedLinkCard />
          </>
        ) : null}
      </div>
    </>
  );
}

/** React Router 7's lazy-route convention. */
export const Component = Overview;

function CardLabel({ children }: { children: string }) {
  return <p className="type-label text-foreground-secondary">{children}</p>;
}

function TodayCard({
  points,
  delta,
  categories,
}: {
  points: number;
  delta: number;
  categories: Category[];
}) {
  const t = useTranslations();
  return (
    <SurfaceCard as="section" className="flex flex-col gap-2">
      <CardLabel>{t('overview.todayPoints')}</CardLabel>
      <div className="flex items-baseline gap-3">
        <span data-testid="today-points" className="type-display text-[44px] tabular-nums">
          {points}
        </span>
        <span
          data-testid="delta"
          data-sign={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
          className={cn(
            'type-caption',
            delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-foreground-subtle',
          )}
        >
          {delta === 0
            ? t('overview.sameAsYesterday')
            : t('overview.vsYesterday', { 0: delta > 0 ? `+${delta}` : `${delta}` })}
        </span>
      </div>
      {categories.length === 0 ? (
        <p data-testid="today-empty" className="type-caption text-foreground-secondary">
          {t('overview.empty')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {categories.map((category) => (
            <CategoryChip key={category} category={category} label={t(`categories.${category}`)} />
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}

function StreakCard({ current, longest }: { current: number; longest: number }) {
  const t = useTranslations();
  return (
    <SurfaceCard as="section" className="flex flex-col gap-3">
      <CardLabel>{t('overview.streak')}</CardLabel>
      <StreakCounter
        days={current}
        longest={longest}
        daysLabel={t('overview.streakDaysLabel')}
        longestLabel={t('overview.longest', { 0: longest })}
        dotsLabel={t('overview.streakDots', { 0: filledDots(current) })}
      />
    </SurfaceCard>
  );
}

function RankCard({ rank, memberCount }: { rank: number; memberCount: number }) {
  const t = useTranslations();
  return (
    <SurfaceCard as="section" className="flex flex-col gap-3">
      <CardLabel>{t('overview.rank')}</CardLabel>
      <div className="flex flex-col gap-1">
        <p
          className="flex items-baseline gap-1"
          aria-label={t('overview.rankOf', { 0: rank, 1: memberCount })}
        >
          <span data-testid="rank" className="type-display text-[30px] tabular-nums">
            {rank}
          </span>
          <span aria-hidden="true" className="type-h3 text-foreground-secondary">
            / {memberCount}
          </span>
        </p>
        <p className="type-caption text-foreground-subtle">{t('overview.inGroup')}</p>
      </div>
    </SurfaceCard>
  );
}

/**
 * "Hôm nay còn ghi điểm được": one row per category, ticked when its cap is already hit. The
 * trailing text is the cap noun on a done row ("đã đủ tuần này" for the weekly group cap) and the
 * points still on offer otherwise — `ChecklistRow` on iOS.
 */
function ChecklistCard({ capsHit }: { capsHit: Record<Category, boolean> }) {
  const t = useTranslations();
  return (
    <SurfaceCard as="section" className="flex flex-col">
      <CardLabel>{t('overview.remaining')}</CardLabel>
      <ul className="pt-2">
        {CATEGORY_ORDER.map((category, index) => {
          const rule = RULEBOOK.find((entry) => entry.category === category);
          const done = capsHit[category];
          const period = rule?.capPeriod === 'week' ? 'overview.capPeriodWeek' : 'overview.capPeriodDay';
          return (
            <li
              key={category}
              data-testid="checklist-row"
              data-category={category}
              data-done={done ? 'true' : 'false'}
              className={cn(
                'flex min-h-11 items-center gap-3',
                index > 0 && 'border-border border-t',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-[18px] shrink-0 rounded-full border-2',
                  done ? 'border-success bg-success' : 'border-border-strong',
                )}
              />
              <span
                className={cn(
                  'type-body-medium min-w-0 flex-1 truncate',
                  done ? 'text-foreground-subtle line-through' : 'text-foreground',
                )}
              >
                {t(`categories.${category}`)}
              </span>
              <span
                className={cn('type-caption shrink-0', done ? 'text-foreground-subtle' : 'text-foreground')}
              >
                {done ? t('overview.capDone', { 0: t(period) }) : `+${rule?.points ?? 0}`}
              </span>
            </li>
          );
        })}
      </ul>
    </SurfaceCard>
  );
}

/** The one accent card on the screen, so the challenge total reads as the milestone number. */
function TotalCard({ total, bonusPoints }: { total: number; bonusPoints: number }) {
  const t = useTranslations();
  return (
    <SurfaceCard as="section" accent className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <CardLabel>{t('overview.challengeTotal')}</CardLabel>
        <p className="type-caption text-foreground-secondary">
          {t('overview.streakBonus', { 0: bonusPoints })}
        </p>
      </div>
      <span data-testid="challenge-total" className="type-display shrink-0 text-[30px] tabular-nums">
        {total}
      </span>
    </SurfaceCard>
  );
}

function FeedLinkCard() {
  const t = useTranslations();
  return (
    <Link to="/feed" className="block rounded-xl">
      <SurfaceCard className="flex items-center justify-between gap-3">
        <span className="type-h3 min-w-0 truncate">{t('overview.feedCard')}</span>
        <ChevronRightGlyph className="text-foreground-subtle size-4 shrink-0" />
      </SurfaceCard>
    </Link>
  );
}

/** Cards in outline while the dashboard loads — the layout does not jump when the data lands. */
function OverviewSkeleton() {
  return (
    <div data-testid="overview-skeleton" aria-busy="true" className="flex flex-col gap-4">
      <div className="bg-surface-2 h-[132px] animate-pulse rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-2 h-[140px] animate-pulse rounded-xl" />
        <div className="bg-surface-2 h-[140px] animate-pulse rounded-xl" />
      </div>
      <div className="bg-surface-2 h-[180px] animate-pulse rounded-xl" />
    </div>
  );
}
