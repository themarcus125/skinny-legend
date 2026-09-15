import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { Category, EntryDto, HistoryEntryDto } from '@skinny/shared/wire';
import { CATEGORIES } from '@skinny/shared/wire';
import { AlertBanner, CategoryChip, EmptyState, SurfaceCard, cn } from '@skinny/ui';
import { CameraGlyph, MapPinGlyph } from '@/app/icons';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { useEndSentinel } from '@/lib/use-end-sentinel';
import { Button } from '@/ui/button';
import { ConfirmDialog } from './confirm-dialog';
import { VerdictSheet } from '@/features/track/verdict-sheet';
import {
  beginSave,
  failSave,
  initVerdictState,
  needsSave,
  type VerdictState,
} from '@/features/track/verdict-model';

export interface DaySection {
  date: string;
  points: number;
  entries: HistoryEntryDto[];
}

/** No cap is known for a past day until the edit's `PATCH` answers — ruling 2 (Task 8). */
const NO_CAPS: Record<Category, boolean> = Object.fromEntries(
  CATEGORIES.map((category) => [category, false]),
) as Record<Category, boolean>;

/**
 * Port of `AccountModel.sections`: newest day first, and newest entry first inside a day. Pure so
 * the grouping is testable without a query client.
 */
export function groupByDay(entries: readonly HistoryEntryDto[]): DaySection[] {
  const byDate = new Map<string, HistoryEntryDto[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.localDate);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.localDate, [entry]);
  }
  return [...byDate.entries()]
    .map(([date, rows]) => ({
      date,
      entries: [...rows].sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
      points: rows.reduce((sum, row) => sum + (row.points ?? 0), 0),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * "Lịch sử hoạt động" — my confirmed and pending entries, grouped by day, paged by cursor, each
 * row correctable through the **Track** feature's verdict sheet in `{ kind: 'edit' }` mode. That
 * reuse is the point (`AccountView.makeEditModel` does the same on iOS): the rules for what may be
 * selected, what may be saved and what the points become live in `verdict-model.ts` alone.
 */
export function AccountHistory() {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<VerdictState | null>(null);
  /** The entry the delete confirmation is standing over; null while nothing is being deleted. */
  const [deleting, setDeleting] = useState<EntryDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const history = useInfiniteQuery({
    queryKey: queryKeys.myEntries,
    queryFn: ({ pageParam }) => api.myEntries(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  const days = groupByDay(entries);
  const hasMore = history.hasNextPage;
  const { fetchNextPage, isFetchingNextPage } = history;

  const onReachEnd = useCallback(() => {
    if (hasMore && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasMore, isFetchingNextPage]);
  const sentinel = useEndSentinel(hasMore && !isFetchingNextPage, onReachEnd);

  /**
   * An edit can move points for every other entry in the same day and week (a cap that was full
   * may not be any more), so the whole history is refetched rather than patched in place — and so
   * is everything else that scores: the board, the dashboard, the trends, the feed and the map.
   */
  const invalidateScoring = useCallback(() => {
    for (const key of [
      queryKeys.myEntries,
      queryKeys.dashboard,
      queryKeys.leaderboard,
      queryKeys.trends,
      queryKeys.feed,
      queryKeys.map,
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);

  const openEdit = (entry: HistoryEntryDto) => {
    setSheet(
      initVerdictState({
        entry,
        mode: { kind: 'edit' },
        // Placeholders until the PATCH answers with the real projection (ruling 2): the sheet
        // renders "điểm sẽ được máy chủ tính lại" instead of a local estimate in the meantime.
        capsHit: NO_CAPS,
        cappedCategories: [],
        projectedPoints: entry.points ?? 0,
        placeName: entry.placeName,
        placeSource: entry.placeSource,
      }),
    );
  };

  /**
   * `DELETE /entries/:id` — a soft delete on the server (the row goes `rejected`, spec §6), and the
   * iOS swipe action's counterpart. It is behind the same `ConfirmDialog` the sign-out row uses:
   * the entry's own day is the question, "Xoá" the answer.
   */
  const confirmDelete = () => {
    const entry = deleting;
    if (!entry) return;
    setIsDeleting(true);
    setDeleteErrorKey(null);
    void api
      .deleteEntry(entry.id)
      .then(() => {
        if (!alive.current) return;
        setIsDeleting(false);
        setDeleting(null);
        setSheet(null);
        invalidateScoring();
      })
      .catch((error: unknown) => {
        if (!alive.current) return;
        setIsDeleting(false);
        setDeleting(null);
        // The banner lives on the screen, *behind* two modals — so the modals go first. Leaving
        // the verdict sheet up would render the failure where nobody can see it.
        setSheet(null);
        setDeleteErrorKey(describeError(error));
      });
  };

  const primary = () => {
    if (!sheet) return;
    if (!needsSave(sheet)) {
      setSheet(null);
      return;
    }
    const saving = beginSave(sheet);
    setSheet(saving);
    void api
      .confirmEntry(saving.entry.id, {
        categories: saving.selected,
        placeName: saving.placeName,
        placeSource: saving.placeSource,
      })
      .then(() => {
        if (!alive.current) return;
        // The response's own projection is not adopted into a sheet that is closing: the refetch
        // below is what re-renders the row, and it carries the server's numbers for the whole
        // day, not just this entry (an edit can move its neighbours' points too).
        setSheet(null);
        invalidateScoring();
      })
      .catch((error: unknown) => {
        if (alive.current) setSheet(failSave(saving, error));
      });
  };

  return (
    <>
      <h2 className="type-label text-foreground-subtle px-1 pt-2">{t('account.history')}</h2>

      {history.error ? (
        <AlertBanner
          tone="destructive"
          title={t('account.historyLoadFailed')}
          description={t(describeError(history.error))}
          action={
            <Button size="sm" variant="secondary" onClick={() => void history.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : null}

      {deleteErrorKey ? (
        <AlertBanner
          tone="destructive"
          title={t('account.deleteFailed')}
          description={t(deleteErrorKey)}
        />
      ) : null}

      {entries.length === 0 && history.isPending ? (
        <div
          data-testid="history-skeleton"
          aria-busy="true"
          className="bg-surface-2 h-[220px] animate-pulse rounded-xl"
        />
      ) : null}

      {entries.length === 0 && !history.isPending && !history.error ? (
        <EmptyState
          icon={<CameraGlyph className="size-8" />}
          title={t('account.historyEmpty')}
          description={t('account.historyEmptyBody')}
        />
      ) : null}

      {days.map((day) => (
        <section key={day.date} data-testid="history-day" data-date={day.date} className="flex flex-col gap-1.5">
          {/* One stop for a screen reader: the day and its total read as a single summary rather
              than as a heading followed by a bare number. */}
          <div
            role="group"
            className="flex items-baseline justify-between gap-2 px-1"
            aria-label={t('account.dayPoints', { 0: formatLocalDay(day.date, locale), 1: day.points })}
          >
            <h3 className="type-label text-foreground-secondary">
              {formatLocalDay(day.date, locale)}
            </h3>
            <span data-testid="history-day-points" className="type-caption tabular-nums" aria-hidden="true">
              +{day.points}
            </span>
          </div>
          <SurfaceCard padding="none" className="overflow-hidden">
            <ul>
              {day.entries.map((entry, index) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  divided={index > 0}
                  onEdit={() => openEdit(entry)}
                />
              ))}
            </ul>
          </SurfaceCard>
        </section>
      ))}

      {entries.length > 0 ? (
        <div
          ref={sentinel}
          data-testid="history-footer"
          data-has-more={hasMore ? 'true' : 'false'}
          className="flex justify-center py-1"
        >
          {hasMore ? (
            <Button size="sm" variant="secondary" disabled={isFetchingNextPage} onClick={onReachEnd}>
              {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {sheet ? (
        <VerdictSheet
          state={sheet}
          onChange={setSheet}
          // A past entry's coordinates are not in the history payload, so the place list has no
          // fix to search from — the same `placeResolver: nil` the iOS Account sheet passes.
          lat={null}
          lng={null}
          onDismiss={() => setSheet(null)}
          onPrimary={primary}
          // `VerdictState.entry` is the row the sheet was opened over — its id and day are all the
          // deletion needs, so there is no second copy of the entry to keep in sync.
          onDelete={() => setDeleting(sheet.entry)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={formatLocalDay(deleting.localDate, locale)}
          confirmLabel={t('common.delete')}
          busy={isDeleting}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}

function HistoryRow({
  entry,
  divided,
  onEdit,
}: {
  entry: HistoryEntryDto;
  divided: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations();
  return (
    <li
      data-testid="history-row"
      data-entry-id={entry.id}
      className={cn('flex items-center gap-3 p-4', divided && 'border-border border-t')}
    >
      <img
        src={entry.thumbUrl ?? entry.photoUrl}
        alt=""
        aria-hidden="true"
        className="bg-surface-2 size-[60px] shrink-0 rounded-2xl object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {entry.categories.length > 0 ? (
            entry.categories.map((category) => (
              <CategoryChip key={category} category={category} label={t(`categories.${category}`)} />
            ))
          ) : (
            <span className="type-caption text-foreground-subtle">{t('track.noCategory')}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {entry.status === 'pending' ? (
            <span className="type-label bg-warning-soft text-warning rounded-full px-2 py-0.5">
              {t('account.notConfirmed')}
            </span>
          ) : null}
          {entry.placeName ? (
            <p className="type-caption text-foreground-secondary flex min-w-0 items-center gap-1">
              <MapPinGlyph className="size-3.5 shrink-0" />
              <span className="truncate">{entry.placeName}</span>
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" className="self-start px-0" onClick={onEdit}>
          {t('common.notRight')}
        </Button>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span data-testid="history-points" className="type-h3 font-heading tabular-nums">
          +{entry.points ?? 0}
        </span>
        {entry.capped ? (
          <span data-testid="history-capped" className="type-label text-foreground-subtle">
            {t('account.capped')}
          </span>
        ) : null}
      </div>
    </li>
  );
}
