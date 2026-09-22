import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { Category, EntryDto } from '@skinny/shared/wire';
import { CATEGORIES } from '@skinny/shared/wire';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { ConfirmDialog } from '@/features/account/confirm-dialog';
import { VerdictSheet } from './verdict-sheet';
import {
  beginSave,
  failSave,
  initVerdictState,
  needsSave,
  patchBody,
  type VerdictState,
} from './verdict-model';

/** No cap is known for a past day until the edit's `PATCH` answers — ruling 2 (Task 8). */
const NO_CAPS: Record<Category, boolean> = Object.fromEntries(
  CATEGORIES.map((category) => [category, false]),
) as Record<Category, boolean>;

/**
 * The verdict sheet in `{ kind: 'edit' }` mode plus its delete confirmation, as one controller
 * shared by the Ghi nhận history and the group feed's "Sửa". The rules for what may be saved
 * live in `verdict-model.ts`; this hook only owns the request lifecycle and the refetches.
 */
export function useEntryEditor(): {
  openEdit: (entry: EntryDto & { points?: number }) => void;
  /** The verdict sheet and the delete dialog, or null while closed. Render it once. */
  element: ReactNode;
  /** `errors.*` key of the last failed delete; the screen decides where to show it. */
  deleteErrorKey: string | null;
} {
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

  const openEdit = useCallback((entry: EntryDto & { points?: number }) => {
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
        title: entry.title,
        note: entry.note,
      }),
    );
  }, []);

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
      .confirmEntry(saving.entry.id, patchBody(saving))
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

  const element: ReactNode = (
    <>
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

  return { openEdit, element, deleteErrorKey };
}
