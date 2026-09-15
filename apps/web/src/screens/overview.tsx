import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import type { Category } from '@skinny/shared/wire';
import { RULEBOOK } from '@skinny/shared/scoring';
import { AlertBanner, CategoryChip, ProgressRing, StreakCounter, SurfaceCard, cn, filledDots } from '@skinny/ui';
import {
  ArrowDownRightGlyph,
  ArrowUpRightGlyph,
  CheckGlyph,
  EqualGlyph,
  FlameGlyph,
  SparklesGlyph,
  TrophyGlyph,
} from '@/app/icons';
import { useCallback, useEffect } from 'react';
import { LargeTitle } from '@/app/large-title';
import { PullToRefresh } from '@/app/pull-to-refresh';
import { useSession } from '@/auth/session';
import { usePush } from '@/push/use-push';
import { FeedSection } from '@/features/feed/feed';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';

/** The number size iOS's `DashboardView` passes both cards of the streak/rank pair. */
const PAIR_NUMBER_SIZE = 30;

/**
 * The most a day can score from the daily-capped categories — what the Today ring fills
 * against. The weekly group bonus can push a day past it, and the ring simply reads full then.
 */
const DAILY_MAX = RULEBOOK.filter((rule) => rule.capPeriod === 'day').reduce(
  (sum, rule) => sum + rule.points * rule.capCount,
  0,
);

/** The card chrome shared by the tinted cards, which paint their own fill instead of `bg-card`. */
const TINTED_CARD = 'relative overflow-hidden rounded-xl border p-[18px] shadow-card';

/**
 * Trang chủ — the dashboard. Port of `DashboardView`
 * (ios/SkinnyLegend/Features/Dashboard/DashboardView.swift): today's points and the delta vs
 * yesterday, the streak counter, the rank, the "still scorable today" checklist, the accent
 * card with the challenge total, and — since SKI-134 — the group feed itself underneath, on
 * its own query so neither half blanks the other.
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
      <PullToRefresh keys={[queryKeys.dashboard, queryKeys.feed]} />
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
          </>
        ) : null}
        {/*
         * The group log, under the dashboard cards and on its own query: neither half blanks
         * the other when its request fails (SKI-134).
         */}
        <FeedSection />
      </div>
    </>
  );
}

/** React Router 7's lazy-route convention. */
/**
 * The routed screen: `Overview` plus the reminders default. Reminders are on unless the member
 * turns them off, so the first visit to Trang chủ with a session asks the browser (once per
 * user id; `requestIfUndecided` is the guard). The plain `Overview` stays prop-free so its tests
 * never stand a registrar up.
 */
export function OverviewScreen() {
  const session = useSession();
  const { registrar } = usePush();
  const userId =
    session.status === 'active' || session.status === 'pending' ? session.user.id : null;
  const ask = useCallback(() => {
    if (userId !== null) void registrar.requestIfUndecided(userId);
  }, [registrar, userId]);
  useEffect(ask, [ask]);
  return <Overview />;
}

/** React Router 7's lazy-route convention. */
export const Component = OverviewScreen;

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
    <section
      data-testid="today-card"
      className={cn(TINTED_CARD, 'border-primary-border bg-primary-soft text-foreground')}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <CardLabel>{t('overview.todayPoints')}</CardLabel>
          <DeltaBadge delta={delta} />
          <p className="type-caption text-foreground-subtle">
            {t('overview.dailyMax', { 0: DAILY_MAX })}
          </p>
        </div>
        {/* The signature: the day's points drawn as how much of the day is already banked. */}
        <ProgressRing
          value={points}
          max={DAILY_MAX}
          size={100}
          strokeWidth={9}
          label={t('overview.todayPointsOf', { 0: points })}
        >
          <span data-testid="today-points" className="type-display text-[40px] tabular-nums">
            {points}
          </span>
        </ProgressRing>
      </div>
      {categories.length === 0 ? (
        <p data-testid="today-empty" className="type-caption text-foreground-secondary pt-3">
          {t('overview.empty')}
        </p>
      ) : (
        // Chips on the Vanilla fill sit on white: the group chip's own Vanilla would vanish.
        <div className="flex flex-wrap gap-2 pt-3 [&_[data-slot=category-chip]]:bg-card [&_[data-slot=category-chip]]:shadow-card">
          {categories.map((category) => (
            <CategoryChip key={category} category={category} label={t(`categories.${category}`)} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The signed delta vs yesterday. The glyph carries the direction so colour is not the only
 * signal, and the whole badge is one `aria-label` — `deltaBadge` on iOS, which combines its
 * children for exactly the same reason.
 */
function DeltaBadge({ delta }: { delta: number }) {
  const t = useTranslations();
  const Glyph = delta > 0 ? ArrowUpRightGlyph : delta < 0 ? ArrowDownRightGlyph : EqualGlyph;
  const label =
    delta === 0
      ? t('overview.sameAsYesterday')
      : delta > 0
        ? t('overview.moreThanYesterday', { 0: delta })
        : t('overview.lessThanYesterday', { 0: -delta });
  return (
    <span
      data-testid="delta"
      data-sign={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
      aria-label={label}
      className={cn(
        'type-caption inline-flex w-fit items-center gap-1 rounded-full bg-card/70 px-2.5 py-1',
        delta > 0 ? 'text-success' : delta < 0 ? 'text-destructive' : 'text-foreground-subtle',
      )}
    >
      <Glyph className="size-3.5 shrink-0" />
      {delta === 0
        ? t('overview.sameAsYesterdayCaption')
        : t('overview.vsYesterday', { 0: delta > 0 ? `+${delta}` : `${delta}` })}
    </span>
  );
}

function StreakCard({ current, longest }: { current: number; longest: number }) {
  const t = useTranslations();
  return (
    <section className={cn(TINTED_CARD, 'flex flex-col gap-3 border-transparent bg-warning-soft')}>
      <FlameGlyph aria-hidden="true" className="text-warning pointer-events-none absolute -right-3 -bottom-4 size-24 opacity-20" />
      <CardLabel>{t('overview.streak')}</CardLabel>
      <div
        role="group"
        aria-label={t('overview.streakDays', { 0: current })}
        // The counter's empty dots are the neutral track, which disappears on the amber fill:
        // here they take the card's own amber, a shade deeper, and every dot grows a little.
        className="relative [&_[data-testid=streak-dot]]:size-2.5 [&_[data-testid=streak-dot][data-filled=false]]:bg-warning/35"
      >
        <StreakCounter
          days={current}
          longest={longest}
          numberSize={PAIR_NUMBER_SIZE}
          daysLabel={t('overview.streakDaysLabel')}
          longestLabel={t('overview.longest', { 0: longest })}
          dotsLabel={t('overview.streakDots', { 0: filledDots(current) })}
        />
      </div>
    </section>
  );
}

function RankCard({ rank, memberCount }: { rank: number; memberCount: number }) {
  const t = useTranslations();
  return (
    <section className={cn(TINTED_CARD, 'flex flex-col gap-3 border-transparent bg-info-soft')}>
      <TrophyGlyph aria-hidden="true" className="text-info pointer-events-none absolute -right-3 -bottom-4 size-24 opacity-20" />
      <CardLabel>{t('overview.rank')}</CardLabel>
      <div className="relative flex flex-col gap-1">
        <p
          className="flex items-baseline gap-1"
          aria-label={t('overview.rankOf', { 0: rank, 1: memberCount })}
        >
          <span data-testid="rank" className="type-display text-info text-[30px] tabular-nums">
            {rank}
          </span>
          <span aria-hidden="true" className="type-h3 text-foreground-secondary">
            / {memberCount}
          </span>
        </p>
        <p className="type-caption text-foreground-subtle">{t('overview.inGroup')}</p>
      </div>
    </section>
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
        {RULEBOOK.map(({ category, points, capPeriod }, index) => {
          const done = capsHit[category];
          const period = capPeriod === 'week' ? 'overview.capPeriodWeek' : 'overview.capPeriodDay';
          return (
            <li
              key={category}
              data-testid="checklist-row"
              data-category={category}
              data-done={done ? 'true' : 'false'}
              className={cn('flex min-h-11 items-center gap-3', index > 0 && 'border-border border-t')}
            >
              <span
                aria-hidden="true"
                data-testid="checklist-mark"
                className={cn(
                  'grid size-[18px] shrink-0 place-items-center rounded-full border-2',
                  done ? 'border-success bg-success text-card' : 'border-border-strong',
                )}
              >
                {done ? <CheckGlyph className="size-3" /> : null}
              </span>
              <span
                className={cn(
                  'type-body-medium min-w-0 flex-1 truncate',
                  done ? 'text-foreground-subtle line-through' : 'text-foreground',
                )}
              >
                {t(`categories.${category}`)}
              </span>
              <span
                className={cn(
                  'type-caption shrink-0 rounded-full px-2.5 py-1',
                  done ? 'text-foreground-subtle' : 'bg-surface-2 text-foreground tabular-nums',
                )}
              >
                {done ? t('overview.capDone', { 0: t(period) }) : `+${points}`}
              </span>
            </li>
          );
        })}
      </ul>
    </SurfaceCard>
  );
}

/** The one ink card on the screen, so the challenge total reads as the milestone number. */
function TotalCard({ total, bonusPoints }: { total: number; bonusPoints: number }) {
  const t = useTranslations();
  return (
    <section
      data-testid="total-card"
      className={cn(TINTED_CARD, 'flex items-center justify-between gap-3 border-transparent bg-primary text-primary-foreground')}
    >
      <div
        role="group"
        aria-label={
          bonusPoints === 0
            ? t('overview.totalOf', { 0: total })
            : t('overview.totalWithBonus', { 0: total, 1: bonusPoints })
        }
        className="flex flex-1 items-center justify-between gap-3"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-label text-primary-foreground/70">{t('overview.challengeTotal')}</p>
          <p className="type-caption text-primary-foreground/80 flex items-center gap-1">
            <SparklesGlyph className="size-3.5 shrink-0" />
            {t('overview.streakBonus', { 0: bonusPoints })}
          </p>
        </div>
        <span
          data-testid="challenge-total"
          className="type-display shrink-0 text-[40px] tabular-nums"
        >
          {total}
        </span>
      </div>
    </section>
  );
}

/** All four cards in outline while the dashboard loads — the layout does not jump when it lands. */
function OverviewSkeleton() {
  return (
    <div data-testid="overview-skeleton" aria-busy="true" className="flex flex-col gap-4">
      <div className="bg-surface-2 h-[190px] animate-pulse rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-2 h-[140px] animate-pulse rounded-xl" />
        <div className="bg-surface-2 h-[140px] animate-pulse rounded-xl" />
      </div>
      <div className="bg-surface-2 h-[190px] animate-pulse rounded-xl" />
      <div className="bg-surface-2 h-[84px] animate-pulse rounded-xl" />
    </div>
  );
}
