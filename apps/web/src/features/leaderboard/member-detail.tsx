import { useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import type { HistoryEntryDto } from '@skinny/shared/wire';
import { AlertBanner, Avatar, CategoryChip, EmptyState, SurfaceCard, cn } from '@skinny/ui';
import { ChevronRightGlyph, MapPinGlyph, TrophyGlyph } from '@/app/icons';
import { LargeTitle, SCROLL_CONTAINER_ATTR } from '@/app/large-title';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';

/** Avatar diameter on the header card — `MemberDetailView`'s 56. */
const HEADER_AVATAR = 56;

/**
 * The member behind a leaderboard row. Port of `MemberDetailView`
 * (ios/SkinnyLegend/Features/Leaderboard/MemberDetailView.swift): a header card (avatar, name,
 * rank, season total) over the member's confirmed history as **one** card of rows, paged by
 * cursor.
 *
 * The header reuses the cached leaderboard row — the board is the query that knows a member's
 * rank, and coming in from a tap it is already warm, so this costs nothing.
 */
export function MemberDetail() {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const navigate = useNavigate();
  const { userId = '' } = useParams<{ userId: string }>();

  const board = useQuery({ queryKey: queryKeys.leaderboard, queryFn: () => api.leaderboard() });
  const row = board.data?.find((entry) => entry.user.id === userId);

  const history = useInfiniteQuery({
    queryKey: queryKeys.userEntries(userId),
    queryFn: ({ pageParam }) => api.userEntries(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: userId !== '',
  });

  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  const hasMore = history.hasNextPage;
  const { fetchNextPage, isFetchingNextPage } = history;

  /**
   * The one pagination trigger, and it lives on a footer sentinel in the **outer** scroll
   * container rather than on the list: the rows sit inside a card, and a card can lay out more
   * than the reader has actually reached. `isFetchingNextPage` is what keeps an observer that
   * fires twice (a resize, a re-observe) from double-firing the same page.
   */
  const onReachEnd = useCallback(() => {
    if (hasMore && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasMore, isFetchingNextPage]);
  const sentinel = useEndSentinel(hasMore && !isFetchingNextPage, onReachEnd);

  const name = row?.user.displayName;
  const error = history.error ?? board.error;

  return (
    <>
      <LargeTitle
        title={name ?? t('leaderboard.title')}
        leading={
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('common.back')}
            onClick={() => void navigate('/leaderboard')}
          >
            <ChevronRightGlyph className="size-4 rotate-180" />
          </Button>
        }
      />
      <div className="flex flex-col gap-3.5 px-4 pt-2 pb-8">
        {row ? (
          <SurfaceCard as="section" className="flex items-center gap-3.5">
            <Avatar name={row.user.displayName} src={row.user.avatarUrl} size={HEADER_AVATAR} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p data-testid="member-name" className="type-h2 truncate font-heading">
                {row.user.displayName}
              </p>
              <p className="type-caption text-foreground-secondary">
                {t('leaderboard.memberRank', { 0: row.rank })}
              </p>
            </div>
            <span data-testid="member-total" className="type-display shrink-0 text-[30px] tabular-nums">
              {row.total}
            </span>
          </SurfaceCard>
        ) : (
          <div data-testid="member-skeleton" aria-busy="true" className="bg-surface-2 h-[92px] animate-pulse rounded-xl" />
        )}

        {error ? (
          <AlertBanner
            tone="destructive"
            title={t('leaderboard.memberLoadFailed')}
            description={t(describeError(error))}
            action={
              <Button size="sm" variant="secondary" onClick={() => void history.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}

        {entries.length > 0 ? (
          <SurfaceCard className="overflow-hidden p-[0px]">
            <ul data-testid="history-card">
              {entries.map((entry, index) => (
                <MemberEntryRow
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  divided={index > 0}
                />
              ))}
            </ul>
          </SurfaceCard>
        ) : null}

        {entries.length === 0 && !history.isPending && !error ? (
          <EmptyState icon={<TrophyGlyph className="size-8" />} title={t('leaderboard.memberEmpty')} />
        ) : null}

        {entries.length === 0 && history.isPending ? (
          <div data-testid="history-skeleton" aria-busy="true" className="bg-surface-2 h-[220px] animate-pulse rounded-xl" />
        ) : null}

        {/*
         * The footer is rendered whenever a page has landed, so its `data-has-more` is the
         * assertable terminal state of a short history as well as the paging affordance of a
         * long one. The button is the keyboard and no-IntersectionObserver path to the same
         * `fetchNextPage` the sentinel fires.
         */}
        {entries.length > 0 ? (
          <div
            ref={sentinel}
            data-testid="history-footer"
            data-has-more={hasMore ? 'true' : 'false'}
            className="flex justify-center py-1"
          >
            {hasMore ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={isFetchingNextPage}
                onClick={onReachEnd}
              >
                {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** React Router 7's lazy-route convention. */
export const Component = MemberDetail;

function MemberEntryRow({
  entry,
  locale,
  divided,
}: {
  entry: HistoryEntryDto;
  locale: string;
  divided: boolean;
}) {
  const t = useTranslations();
  return (
    <li
      data-testid="history-row"
      data-entry-id={entry.id}
      className={cn('flex items-center gap-3.5 p-4', divided && 'border-border border-t')}
    >
      <img
        src={entry.thumbUrl ?? entry.photoUrl}
        alt=""
        aria-hidden="true"
        className="bg-surface-2 size-[72px] shrink-0 rounded-2xl object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p data-testid="history-day" className="type-h3 font-heading">
          {formatLocalDay(entry.localDate, locale)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {entry.categories.map((category) => (
            <CategoryChip key={category} category={category} label={t(`categories.${category}`)} />
          ))}
        </div>
        {entry.placeName ? (
          <p
            data-testid="history-place"
            className="type-caption text-foreground-secondary flex items-center gap-1 truncate"
          >
            <MapPinGlyph className="size-3.5 shrink-0" />
            <span className="truncate">{entry.placeName}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Fires `onReach` when the element scrolls into the shell's scroll container. Falls back to
 * doing nothing where `IntersectionObserver` is missing (jsdom) — the footer button is then the
 * only way on, which is exactly what the tests drive.
 */
function useEndSentinel(enabled: boolean, onReach: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled || typeof IntersectionObserver === 'undefined') return;
    const root = element.closest<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`);
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) onReach();
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, onReach]);
  return ref;
}
