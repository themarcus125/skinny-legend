import { useCallback, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import type { FeedEntryDto } from '@skinny/shared/wire';
import { AlertBanner, Avatar, CategoryChip, EmptyState, SurfaceCard, cn } from '@skinny/ui';
import { CommentGlyph, HeartGlyph, MapPinGlyph, PhotoStackGlyph } from '@/app/icons';
import { PlaceButton } from '@/features/map/place-button';
import { useEntryEditor } from '@/features/track/use-entry-editor';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { PhotoButton } from '@/app/photo-viewer';
import { queryKeys } from '@/lib/query';
import { useEndSentinel } from '@/lib/use-end-sentinel';
import { Button } from '@/ui/button';
import { CommentSheet } from './comment-sheet';
import {
  setCommentCountInFeed,
  settleHeartInFeed,
  toggleHeartInFeed,
  type FeedPages,
} from './feed-model';

/** Avatar diameter on a feed row — `FeedRow`'s 34. */
const ROW_AVATAR = 34;

/** One day of the group's log: the `localDate` and the entries that fall on it, newest first. */
interface FeedDay {
  date: string;
  entries: FeedEntryDto[];
}

/**
 * Groups a cursor-paged feed into day sections **without re-sorting it**.
 *
 * `GET /feed` is ordered by `created_at` descending, which is the order the reader sees and the
 * order the cursor continues from; an entry backdated by its photo's EXIF can therefore arrive
 * after a later day's entries. Walking the list and opening a new section whenever the date
 * changes keeps the server's order intact — re-sorting by date would reshuffle rows under the
 * reader every time a page lands, and would disagree with the cursor.
 */
export function groupByDay(entries: FeedEntryDto[]): FeedDay[] {
  const days: FeedDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.localDate) last.entries.push(entry);
    else days.push({ date: entry.localDate, entries: [entry] });
  }
  return days;
}

/**
 * Nhật ký nhóm — the group log, now the tail of Trang chủ rather than a screen of its own.
 * Port of `FeedView` (ios/SkinnyLegend/Features/Feed/FeedView.swift): every member's confirmed
 * entries newest first, each row a photo over the author, their category chips and the place
 * *name* — never coordinates, which live only on the map (spec §8 step 7).
 *
 * It owns its **own** query, which is the point of it being a section rather than markup the
 * dashboard renders: the two fail and retry independently, so a feed the server chokes on still
 * leaves today's points on the screen, and a failed dashboard still shows the group's log.
 *
 * iOS renders one flat `LazyVStack`; the web groups the same order under a day heading, which is
 * what `LocalDay.display` is already doing per row there and reads better in a narrow column.
 * Paging is the footer sentinel plus "Tải thêm" (`useEndSentinel`), the web's stand-in for
 * `FeedModel.loadNextPageIfNeeded(after:)`.
 */
export function FeedSection({ meId = null }: { meId?: string | null } = {}) {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const editor = useEntryEditor();
  // The entry whose comment thread is open, or null when the sheet is down.
  const [commenting, setCommenting] = useState<string | null>(null);
  const [heartErrorKey, setHeartErrorKey] = useState<string | null>(null);

  const feed = useInfiniteQuery({
    queryKey: queryKeys.feed,
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  /**
   * Optimistic: the cache flips before the request, the answer settles it, an error rolls it
   * back to the snapshot. One mutation for both directions — the entry's current flag decides
   * which request goes out.
   */
  const heart = useMutation({
    mutationFn: (entry: FeedEntryDto) =>
      entry.heartedByMe ? api.unheartEntry(entry.id) : api.heartEntry(entry.id),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed });
      const snapshot = queryClient.getQueryData<FeedPages>(queryKeys.feed);
      if (snapshot) {
        queryClient.setQueryData<FeedPages>(queryKeys.feed, toggleHeartInFeed(snapshot, entry.id));
      }
      setHeartErrorKey(null);
      return { snapshot };
    },
    onSuccess: (truth, entry) => {
      const current = queryClient.getQueryData<FeedPages>(queryKeys.feed);
      if (current) {
        queryClient.setQueryData<FeedPages>(
          queryKeys.feed,
          settleHeartInFeed(current, entry.id, truth),
        );
      }
    },
    onError: (error, _entry, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData<FeedPages>(queryKeys.feed, context.snapshot);
      }
      setHeartErrorKey(describeError(error));
    },
  });

  const entries = feed.data?.pages.flatMap((page) => page.entries) ?? [];
  const days = groupByDay(entries);
  const hasMore = feed.hasNextPage;
  const { error, isPending, fetchNextPage, isFetchingNextPage } = feed;

  const onReachEnd = useCallback(() => {
    if (hasMore && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasMore, isFetchingNextPage]);
  const sentinel = useEndSentinel(hasMore && !isFetchingNextPage, onReachEnd);

  return (
    <section data-testid="feed-section" className="flex flex-col gap-3.5 pt-2">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 data-testid="feed-heading" className="type-h2 font-heading">
          {t('feed.title')}
        </h2>
        {/* A `Link`, not a button: the map is a route, so it deep-links like any address. */}
        <Link
          to="/feed/map"
          data-testid="feed-map-link"
          className="type-caption text-primary inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2"
        >
          <MapPinGlyph className="size-4" />
          {t('feed.viewOnMap')}
        </Link>
      </div>

      {error ? (
        <AlertBanner
          tone="destructive"
          title={t('feed.loadFailed')}
          description={t(describeError(error))}
          action={
            <Button size="sm" variant="secondary" onClick={() => void feed.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : null}

      {/* `AlertBanner` owns its own test id, so the heart's failure gets its own wrapper. */}
      {heartErrorKey ? (
        <div data-testid="feed-heart-error">
          <AlertBanner
            tone="destructive"
            title={t('feed.heartFailed')}
            description={t(heartErrorKey)}
          />
        </div>
      ) : null}

      {entries.length === 0 && isPending ? (
        <div data-testid="feed-skeleton" aria-busy="true" className="flex flex-col gap-3.5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="bg-surface-2 h-[300px] animate-pulse rounded-xl" />
          ))}
        </div>
      ) : null}

      {entries.length === 0 && !isPending && !error ? (
        <EmptyState
          icon={<PhotoStackGlyph className="size-8" />}
          title={t('feed.emptyTitle')}
          description={t('feed.empty')}
        />
      ) : null}

      {days.map((day) => (
        <div
          key={day.date}
          data-testid="feed-day"
          data-date={day.date}
          className="flex flex-col gap-3"
        >
          <h3 data-testid="feed-day-heading" className="type-h3 text-foreground-secondary px-0.5">
            {formatLocalDay(day.date, locale)}
          </h3>
          {day.entries.map((entry) => (
            <FeedRow
              key={entry.id}
              entry={entry}
              meId={meId}
              onHeart={() => heart.mutate(entry)}
              onComment={() => setCommenting(entry.id)}
              onEdit={() => editor.openEdit(entry)}
            />
          ))}
        </div>
      ))}

      {/*
       * Rendered whenever a page has landed, so `data-has-more` is the assertable terminal
       * state of a short feed as well as the paging affordance of a long one. The button is
       * the keyboard and no-IntersectionObserver path to the same `fetchNextPage`.
       */}
      {entries.length > 0 ? (
        <div
          ref={sentinel}
          data-testid="feed-footer"
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

      {editor.element}

      {/*
       * The sheet reports the thread's new size and the card's count follows it here, rather
       * than refetching the whole feed for one number.
       */}
      {commenting ? (
        <CommentSheet
          entryId={commenting}
          onDismiss={() => setCommenting(null)}
          onCountChange={(count) => {
            const current = queryClient.getQueryData<FeedPages>(queryKeys.feed);
            if (current) {
              queryClient.setQueryData<FeedPages>(
                queryKeys.feed,
                setCommentCountInFeed(current, commenting, count),
              );
            }
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * One entry, `FeedRow`'s anatomy: the photo full-bleed across the card, then the author's avatar
 * and name, the member's own title and note when they wrote one, the category chips, and the
 * place name when there is one — the place being the tap
 * target that opens this entry on the map — and the action row: the heart, the comment count,
 * and "Sửa" on the reader's own entries.
 */
function FeedRow({
  entry,
  meId,
  onHeart,
  onComment,
  onEdit,
}: {
  entry: FeedEntryDto;
  meId: string | null;
  onHeart: () => void;
  onComment: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations();
  const mine = meId !== null && entry.userId === meId;
  /**
   * The visible count sits *inside* the button, where an `aria-label` would silence it — so the
   * count is folded into the name instead: "Thả tim · 3 tim", never a bare "Thả tim" over a 3.
   */
  const heartLabel = entry.heartedByMe ? t('feed.unheart') : t('feed.heart');
  const heartName =
    entry.heartCount > 0
      ? `${heartLabel} · ${t('feed.heartCount', { 0: entry.heartCount })}`
      : heartLabel;
  const commentName =
    entry.commentCount > 0
      ? `${t('feed.comments')} · ${t('feed.commentCount', { 0: entry.commentCount })}`
      : t('feed.comments');
  return (
    <SurfaceCard as="article" padding="none" className="overflow-hidden">
      <div data-testid="feed-row" data-entry-id={entry.id}>
        <PhotoButton
          src={entry.thumbUrl ?? entry.photoUrl}
          full={entry.photoUrl}
          className="bg-surface-2 h-[200px] w-full"
        />
        <div className="flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={entry.user.displayName} src={entry.user.avatarUrl} size={ROW_AVATAR} />
            <p data-testid="feed-author" className="type-h3 min-w-0 truncate font-heading">
              {entry.user.displayName}
            </p>
          </div>
          {entry.title ? (
            <p data-testid="feed-title" className="type-body-medium font-medium">
              {entry.title}
            </p>
          ) : null}
          {entry.note ? (
            <p
              data-testid="feed-note"
              className="type-caption text-foreground-secondary whitespace-pre-line"
            >
              {entry.note}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {entry.categories.map((category) => (
              <CategoryChip key={category} category={category} label={t(`categories.${category}`)} />
            ))}
          </div>
          {entry.placeName ? (
            <PlaceButton entryId={entry.id} placeName={entry.placeName} testId="feed-place" />
          ) : null}
          <div className="flex items-center gap-1 pt-1">
            <button
              type="button"
              data-testid="feed-heart"
              aria-pressed={entry.heartedByMe}
              aria-label={heartName}
              onClick={onHeart}
              className={cn(
                'outline-ring flex min-h-11 items-center gap-1.5 rounded-full px-2',
                entry.heartedByMe ? 'text-primary' : 'text-foreground-secondary',
              )}
            >
              <HeartGlyph filled={entry.heartedByMe} className="size-5" />
              {entry.heartCount > 0 ? (
                <span data-testid="feed-heart-count" className="type-label tabular-nums">
                  {entry.heartCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              data-testid="feed-comment"
              aria-label={commentName}
              onClick={onComment}
              className="text-foreground-secondary outline-ring flex min-h-11 items-center gap-1.5 rounded-full px-2"
            >
              <CommentGlyph className="size-5" />
              {entry.commentCount > 0 ? (
                <span data-testid="feed-comment-count" className="type-label tabular-nums">
                  {entry.commentCount}
                </span>
              ) : null}
            </button>
            {mine ? (
              <Button
                size="sm"
                variant="ghost"
                data-testid="feed-edit"
                className="ml-auto"
                onClick={onEdit}
              >
                {t('feed.edit')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
