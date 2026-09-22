import { useId, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { AlertBanner, CategoryChip, SurfaceCard, cn } from '@skinny/ui';
import { CATEGORIES, ENTRY_NOTE_MAX, ENTRY_TITLE_MAX } from '@skinny/shared/wire';
import { CloseGlyph, QuestionGlyph, SparklesGlyph } from '@/app/icons';
import { PhotoButton } from '@/app/photo-viewer';
import { useModalSheet } from '@/app/use-modal-sheet';
import { Button } from '@/ui/button';
import { PlaceChip } from './place-chip';
import {
  applyNote,
  applyPlace,
  applyTitle,
  canSave,
  capWarnings,
  hasChanges,
  isAlreadyTracked,
  isCapped,
  needsSave,
  projectedPoints,
  setEditingCategories,
  toggleCategory,
  verdictOf,
  type VerdictState,
} from './verdict-model';

export interface VerdictSheetProps {
  state: VerdictState;
  onChange: (next: VerdictState) => void;
  /** The fix behind the place list; null when neither EXIF nor geolocation produced one. */
  lat: number | null;
  lng: number | null;
  /** "Huỷ", Escape, or the backdrop — no `PATCH`. */
  onDismiss: () => void;
  /** The primary button: dismiss when nothing needs saving, otherwise `confirmEntry`. */
  onPrimary: () => void;
  /**
   * "Xoá" — offered only in `edit` mode, where the sheet is a correction to an entry that already
   * exists (`AccountView`'s swipe action). A freshly created entry has no delete affordance on
   * iOS either: abandoning that sheet already leaves the entry uncounted.
   */
  onDelete?: () => void;
}

/**
 * Port of `ios/SkinnyLegend/Features/Track/VerdictSheet.swift` as a bottom sheet.
 *
 * The entry is `pending` when the sheet appears: the AI's categories are pre-selected, the
 * points card is a projection, and the primary is "Xác nhận" — the `PATCH` that makes the entry
 * count. "Không đúng?" expands the chips so the selection can be corrected first. A failed
 * verdict opens with the chips already expanded and nothing selected; the button is disabled
 * whenever `canSave` is false, and a line under it says why, so an empty selection is never
 * sent and never a mystery.
 *
 * The state machine lives in `verdict-model.ts`; this file only renders it and reports edits
 * back through `onChange`. The `PATCH` itself belongs to the screen.
 */
export function VerdictSheet({
  state,
  onChange,
  lat,
  lng,
  onDismiss,
  onPrimary,
  onDelete,
}: VerdictSheetProps) {
  const t = useTranslations();
  const titleId = useId();
  const titleFieldId = useId();
  const noteFieldId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const verdict = verdictOf(state);
  const tracked = isAlreadyTracked(state);
  const changed = hasChanges(state);
  const mustSave = needsSave(state);
  const warnings = capWarnings(state, t);

  /**
   * Modality — focus in, Escape and Tab trapped, the page behind locked, focus restored on
   * dismissal. Shared with the map's cluster sheet; see `src/app/use-modal-sheet.ts` for why
   * `onDismiss` is read through a ref rather than depended on.
   */
  useModalSheet({ panelRef: panel, onDismiss });

  const title = verdict === null
    ? t('account.editActivity')
    : tracked
      ? t('track.tracked')
      : t('track.chooseActivity');

  const primaryLabel = state.isSaving
    ? t('common.saving')
    : !mustSave
      ? t('common.done')
      : tracked
        ? t('common.saveChanges')
        : t('common.confirm');

  // Collapsed, the sheet shows only what the AI found; expanded, it shows all three.
  const visible = state.isEditingCategories
    ? CATEGORIES
    : CATEGORIES.filter((category) => state.selected.includes(category));

  /**
   * Ruling 2: an `.edit` sheet has no real projection until its first successful save, so the
   * card is replaced by a note rather than showing an un-capped local estimate.
   */
  const pointsCard =
    state.mode.kind === 'edit' && !state.hasConfirmedProjection ? (
      <SurfaceCard as="section">
        <p className="type-caption text-foreground-secondary">{t('track.serverRecalc')}</p>
      </SurfaceCard>
    ) : (
      <SurfaceCard as="section" className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-label text-foreground-subtle">
            {tracked && !changed ? t('track.pointsEarned') : t('track.projected')}
          </p>
          <p className="type-caption text-foreground-secondary">
            {tracked && !changed ? t('track.alreadyCounted') : t('track.official')}
          </p>
        </div>
        <span data-testid="verdict-points" className="type-display shrink-0 text-[36px] tabular-nums">
          {projectedPoints(state)}
        </span>
      </SurfaceCard>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        data-testid="verdict-backdrop"
        aria-hidden="true"
        onClick={onDismiss}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="verdict-sheet"
        className={cn(
          'relative flex max-h-[92svh] w-full max-w-[520px] flex-col',
          'bg-background rounded-t-xl shadow-popover outline-none',
        )}
      >
        {/* The grabber: a bottom sheet with no drag affordance reads as a stuck page. */}
        <div className="flex justify-center pt-2 pb-1">
          <span aria-hidden="true" className="bg-border-strong h-1 w-9 rounded-full" />
        </div>

        <header className="flex min-h-11 items-center gap-2 px-4">
          <h2 id={titleId} className="type-h3 min-w-0 flex-1 truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('common.cancel')}
            className="text-foreground-secondary grid size-11 shrink-0 place-items-center rounded-full"
          >
            <CloseGlyph className="size-4" />
          </button>
        </header>

        <div
          data-scroll-container
          className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-2 pb-4"
        >
          {/* Already tracked: the points are the headline, so they sit above the fold like the
              iOS sheet's. Every other state leads with the photo and the AI's reasoning. */}
          {tracked ? pointsCard : null}
          <PhotoButton
            src={state.entry.thumbUrl ?? state.entry.photoUrl}
            full={state.entry.photoUrl}
            alt={t('track.photoAlt')}
            className="bg-surface-2 h-[200px] w-full rounded-xl"
          />

          {verdict ? (
            <SurfaceCard as="section" className="flex items-start gap-3">
              {verdict.failed ? (
                <QuestionGlyph className="text-warning mt-0.5 size-5 shrink-0" />
              ) : (
                <SparklesGlyph className="text-info mt-0.5 size-5 shrink-0" />
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <p className="type-label text-foreground-subtle">
                  {verdict.failed ? t('track.notRecognized') : t('track.verdict')}
                </p>
                <p className="type-body-medium">
                  {verdict.failed ? t('track.pickCategories') : verdict.reason}
                </p>
              </div>
            </SurfaceCard>
          ) : null}

          {/*
           * Strava's title and "How'd it go?" box, in that order, ahead of the structured fields.
           * Both are optional: the feed falls back to its usual heading when the title is empty.
           */}
          <SurfaceCard as="section" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={titleFieldId} className="type-label text-foreground-subtle">
                {t('track.titleLabel')}
              </label>
              <input
                id={titleFieldId}
                type="text"
                data-testid="verdict-title"
                value={state.title ?? ''}
                maxLength={ENTRY_TITLE_MAX}
                placeholder={t('track.titlePlaceholder')}
                autoComplete="off"
                enterKeyHint="next"
                onChange={(event) => onChange(applyTitle(state, event.target.value))}
                className="border-border bg-card text-foreground type-body-medium outline-ring placeholder:text-foreground-subtle h-11 rounded-md border px-3"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={noteFieldId} className="type-label text-foreground-subtle">
                {t('track.noteLabel')}
              </label>
              <textarea
                id={noteFieldId}
                data-testid="verdict-note"
                value={state.note ?? ''}
                maxLength={ENTRY_NOTE_MAX}
                placeholder={t('track.notePlaceholder')}
                rows={3}
                onChange={(event) => onChange(applyNote(state, event.target.value))}
                className="border-border bg-card text-foreground type-body-medium outline-ring placeholder:text-foreground-subtle min-h-[84px] resize-none rounded-md border px-3 py-2"
              />
            </div>
          </SurfaceCard>

          <SurfaceCard as="section" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="type-label text-foreground-subtle">{t('common.category')}</p>
              {verdict ? (
                <Button
                  size="md"
                  variant="ghost"
                  data-testid="toggle-editing"
                  onClick={() => onChange(setEditingCategories(state, !state.isEditingCategories))}
                >
                  {/* "Thu gọn", not "Xong": it must not read as the primary that dismisses. */}
                  {state.isEditingCategories ? t('common.collapse') : t('common.notRight')}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {visible.map((category) => (
                <CategoryChip
                  key={category}
                  category={category}
                  label={t(`categories.${category}`)}
                  selected={state.selected.includes(category)}
                  capped={isCapped(state, category)}
                  onToggle={
                    state.isEditingCategories ? () => onChange(toggleCategory(state, category)) : undefined
                  }
                />
              ))}
            </div>
            {warnings.map((warning) => (
              <AlertBanner key={warning} tone="warning" title={warning} />
            ))}
          </SurfaceCard>

          <PlaceChip
            lat={lat}
            lng={lng}
            value={{ name: state.placeName, source: state.placeSource }}
            onChange={(name, source) => onChange(applyPlace(state, name, source))}
          />

          {tracked ? null : pointsCard}

          {state.errorKey ? (
            <AlertBanner tone="destructive" title={t('track.saveFailed')} description={t(state.errorKey)} />
          ) : null}
        </div>

        <div className="border-border border-t flex flex-col gap-2 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Button
            size="lg"
            fullWidth
            data-testid="verdict-primary"
            disabled={!canSave(state)}
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
          {mustSave && state.selected.length === 0 ? (
            <p data-testid="verdict-hint" className="type-caption text-foreground-subtle text-center">
              {t('track.pickOneToConfirm')}
            </p>
          ) : null}
          {onDelete && state.mode.kind === 'edit' ? (
            <Button
              variant="ghost"
              fullWidth
              data-testid="verdict-delete"
              disabled={state.isSaving}
              className="text-destructive"
              onClick={onDelete}
            >
              {t('common.delete')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
