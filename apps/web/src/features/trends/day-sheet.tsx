import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { ApiClient } from '@skinny/api-client';
import type { HistoryEntryDto } from '@skinny/shared/wire';
import { AlertBanner, CategoryChip, EmptyState, cn } from '@skinny/ui';
import { CloseGlyph, MapPinGlyph, PhotoStackGlyph } from '@/app/icons';
import { useModalSheet } from '@/app/use-modal-sheet';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';

/**
 * `GET /entries/mine` is a newest-first cursor feed, so one day's rows are found by walking
 * pages until one reaches past the target — bounded, so a tap on an old square cannot turn into
 * an unbounded fetch. Ported verbatim from `DayEntriesModel.load`
 * (ios/SkinnyLegend/Features/Trends/DayEntriesModel.swift), `maxPages` included.
 */
export const MAX_DAY_PAGES = 5;

export async function fetchDayEntries(api: ApiClient, date: string): Promise<HistoryEntryDto[]> {
  const found: HistoryEntryDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_DAY_PAGES; page += 1) {
    const result = await api.myEntries(cursor);
    found.push(...result.entries.filter((entry) => entry.localDate === date));
    const last = result.entries[result.entries.length - 1];
    // The feed is newest-first, so once a page ends before the target day there is no more of it.
    if (last && last.localDate < date) break;
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return found;
}

/**
 * The entries behind one heatmap square, as a bottom sheet. iOS pushes `DayEntriesView` onto the
 * navigation stack; the web has the heatmap and the sheet on one screen, which keeps the grid
 * visible behind the rows and costs no route.
 *
 * `useModalSheet` is what makes it modal — focus in, trapped, page locked, focus back to the
 * square that opened it, which is how a keyboard reader gets out of the grid and back into it.
 */
export function DaySheet({ date, onDismiss }: { date: string; onDismiss: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const panel = useRef<HTMLDivElement>(null);
  useModalSheet({ panelRef: panel, onDismiss });

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.dayEntries(date),
    queryFn: () => fetchDayEntries(api, date),
  });
  const title = formatLocalDay(date, locale);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* The backdrop dismisses; it is not a control, so it carries no name of its own. */}
      <div
        data-testid="day-backdrop"
        aria-hidden="true"
        onClick={onDismiss}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="day-sheet"
        className="bg-background relative flex max-h-[85dvh] w-full flex-col gap-3 rounded-t-[18px] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-h3 truncate font-heading">{title}</h2>
          <Button size="sm" variant="ghost" aria-label={t('common.close')} onClick={onDismiss}>
            <CloseGlyph className="size-4" />
          </Button>
        </div>

        {error ? (
          <AlertBanner
            tone="destructive"
            title={t('trends.dayLoadFailed')}
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
            data-testid="day-skeleton"
            aria-busy="true"
            className="bg-surface-2 h-[120px] animate-pulse rounded-xl"
          />
        ) : null}

        {data?.length === 0 ? (
          <EmptyState icon={<PhotoStackGlyph className="size-8" />} title={t('trends.dayEmpty')} />
        ) : null}

        {data && data.length > 0 ? (
          <ul data-testid="day-entries" className="overscroll-contain overflow-y-auto">
            {data.map((entry, index) => (
              <li
                key={entry.id}
                data-testid="day-entry"
                data-entry-id={entry.id}
                className={cn('flex items-center gap-3.5 py-3', index > 0 && 'border-border border-t')}
              >
                <img
                  src={entry.thumbUrl ?? entry.photoUrl}
                  alt=""
                  aria-hidden="true"
                  className="bg-surface-2 size-[64px] shrink-0 rounded-2xl object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {entry.categories.map((category) => (
                      <CategoryChip
                        key={category}
                        category={category}
                        label={t(`categories.${category}`)}
                      />
                    ))}
                  </div>
                  {entry.placeName ? (
                    <p className="type-caption text-foreground-secondary flex items-center gap-1 truncate">
                      <MapPinGlyph className="size-3.5 shrink-0" />
                      <span className="truncate">{entry.placeName}</span>
                    </p>
                  ) : null}
                </div>
                {entry.points === undefined ? null : (
                  <span data-testid="day-entry-points" className="type-h3 shrink-0 tabular-nums">
                    {entry.points}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
