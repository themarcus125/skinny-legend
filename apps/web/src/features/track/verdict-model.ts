import type {
  Category,
  EntryDto,
  EntryMutationResponse,
  PlaceSource,
  VerdictDto,
} from '@skinny/shared/wire';
import { CATEGORIES } from '@skinny/shared/wire';
import { RULEBOOK, projectedPoints as rulebookPoints } from '@skinny/shared/scoring';
import { describeError } from '@/lib/api';

/**
 * `ios/SkinnyLegend/Features/Track/VerdictSheetModel.swift` turned inside out.
 *
 * The Swift file is an `@Observable` class whose computed properties *are* the rules; here the
 * same rules are an immutable state object plus pure transitions, so every one of them is
 * testable with no React, no network and no clock. The component keeps the state in `useState`
 * and owns the `PATCH` itself.
 *
 * `POST /entries` creates the entry `pending`, with the AI's categories attached as a suggestion,
 * so nothing counts until the member confirms the sheet with `PATCH /entries/:id`. The
 * `isAlreadyTracked` branch survives for an API that answers `confirmed` (older servers, the
 * admin's re-runs): it turns the primary into a plain dismissal.
 */
export type VerdictMode = { kind: 'created'; verdict: VerdictDto } | { kind: 'edit' };

export interface VerdictModelInit {
  entry: EntryDto;
  mode: VerdictMode;
  capsHit: Record<Category, boolean>;
  cappedCategories: Category[];
  projectedPoints: number;
  placeName: string | null;
  placeSource: PlaceSource;
  /** The member's heading and note, both null until typed. Strava's title and description. */
  title: string | null;
  note: string | null;
}

/** How the sheet ended, for the screen to act on after dismissal. Swift's `Outcome`. */
export type VerdictOutcome = 'tracked' | 'confirmedByHand' | 'abandoned';

export interface VerdictState extends VerdictModelInit {
  selected: Category[];
  isEditingCategories: boolean;
  isSaving: boolean;
  /** `errors.*` catalog key of the last failed save; null while nothing has failed. */
  errorKey: string | null;
  confirmedEntry: EntryDto | null;
  hasConfirmedProjection: boolean;
  didCelebrate: boolean;
  initialSelection: Category[];
  initialPlaceName: string | null;
  initialPlaceSource: PlaceSource;
  initialTitle: string | null;
  initialNote: string | null;
}

/** Selections are compared as sets, but stored in rulebook order so equality is plain. */
function canonical(categories: readonly Category[]): Category[] {
  return CATEGORIES.filter((category) => categories.includes(category));
}

function sameSet(a: readonly Category[], b: readonly Category[]): boolean {
  return a.length === b.length && a.every((category, index) => category === b[index]);
}

export function initVerdictState(init: VerdictModelInit): VerdictState {
  // A failed verdict suggested nothing, so the sheet opens on an empty selection even though
  // the entry may carry categories from somewhere else.
  const starting = canonical(
    init.mode.kind === 'created' && init.mode.verdict.failed ? [] : init.entry.categories,
  );
  return {
    ...init,
    cappedCategories: canonical(init.cappedCategories),
    selected: starting,
    // The editor opens straight away when there is nothing useful to show: a failed verdict,
    // an empty suggestion, or a history edit.
    isEditingCategories:
      init.mode.kind === 'edit' || init.mode.verdict.failed || starting.length === 0,
    isSaving: false,
    errorKey: null,
    confirmedEntry: null,
    hasConfirmedProjection: false,
    didCelebrate: false,
    initialSelection: starting,
    initialPlaceName: init.placeName,
    initialPlaceSource: init.placeSource,
    initialTitle: init.title,
    initialNote: init.note,
  };
}

/** The fresh verdict, when there is one; a history edit has none. */
export function verdictOf(state: VerdictState): VerdictDto | null {
  return state.mode.kind === 'created' ? state.mode.verdict : null;
}

/**
 * True when `POST /entries` already confirmed this entry from the AI verdict: it counted the
 * moment the sheet appeared, and saving is only needed after a correction. A failed verdict
 * leaves the entry `pending`, so both halves are checked rather than trusting the status alone.
 */
export function isAlreadyTracked(state: VerdictState): boolean {
  return state.mode.kind === 'created' && state.entry.status === 'confirmed' && !state.mode.verdict.failed;
}

/** What the server will store for a typed field: trimmed, and null when nothing is left. */
export function normalizeText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Whether the user has changed the categories, the place, the title or the note since the sheet opened. */
export function hasChanges(state: VerdictState): boolean {
  return (
    !sameSet(state.selected, state.initialSelection) ||
    state.placeName !== state.initialPlaceName ||
    state.placeSource !== state.initialPlaceSource ||
    normalizeText(state.title) !== normalizeText(state.initialTitle) ||
    normalizeText(state.note) !== normalizeText(state.initialNote)
  );
}

/**
 * Whether the primary button must `PATCH`: always for a pending entry or a history edit, and
 * only after a correction for an already-tracked one.
 */
export function needsSave(state: VerdictState): boolean {
  return !isAlreadyTracked(state) || hasChanges(state);
}

/**
 * Whether the primary button can act. `PATCH` requires ≥ 1 category, and an already-scored
 * entry corrected down to nothing would silently zero itself — so that one save is refused and
 * the button is disabled rather than offered and rejected.
 */
export function canSave(state: VerdictState): boolean {
  return !state.isSaving && !(needsSave(state) && state.selected.length === 0);
}

/** What the screen should do once the sheet goes away. */
export function outcome(state: VerdictState): VerdictOutcome {
  if (isAlreadyTracked(state)) return 'tracked';
  return state.confirmedEntry ? 'confirmedByHand' : 'abandoned';
}

/**
 * Categories that cannot earn points for this entry, reproducing the Swift precedence exactly.
 *
 * While the selection is untouched this is the server's own `cappedCategories` — no inference
 * needed, since the server already said which of this entry's categories scored 0. Once the
 * user edits, a category `capsHit` reports full that was *not* in the initial (server-scored)
 * selection was filled by some other entry, and stays blocked if it is added back.
 *
 * A history edit has no fresh server projection until it is saved once (ruling 2), so nothing
 * is claimed as capped before that: the local re-projection is an honest un-capped estimate.
 */
export function blockedCategories(state: VerdictState): Category[] {
  if (state.mode.kind === 'edit' && !state.hasConfirmedProjection) return [];
  if (sameSet(state.selected, state.initialSelection)) return state.cappedCategories;
  const filledByOtherEntries = CATEGORIES.filter(
    (category) => state.capsHit[category] && !state.initialSelection.includes(category),
  );
  return canonical([...state.cappedCategories, ...filledByOtherEntries]);
}

/** The server's own number while the selection is untouched; a local re-projection after edits. */
export function projectedPoints(state: VerdictState): number {
  return sameSet(state.selected, state.initialSelection)
    ? state.projectedPoints
    : rulebookPoints(state.selected, blockedCategories(state));
}

export function isCapped(state: VerdictState, category: Category): boolean {
  return blockedCategories(state).includes(category);
}

/** The period noun a category's cap is counted over — Swift's `Rulebook.capNoun(for:)`. */
export function capPeriodKey(category: Category): 'overview.capPeriodDay' | 'overview.capPeriodWeek' {
  return RULEBOOK.find((rule) => rule.category === category)?.capPeriod === 'week'
    ? 'overview.capPeriodWeek'
    : 'overview.capPeriodDay';
}

/**
 * The catalog keys `capWarnings` needs. Spelled out rather than `string` so that `use-intl`'s
 * strictly typed translator — whose key parameter is the union of every catalog path — is
 * assignable to it.
 */
export type CapWarningTranslate = (
  key: 'track.capReached' | `categories.${Category}` | ReturnType<typeof capPeriodKey>,
  values?: Record<string, string | number>,
) => string;

/**
 * One warning per selected-but-blocked category, already translated. The catalog string takes
 * the category label first and the period noun second; the English value reorders them.
 */
export function capWarnings(state: VerdictState, t: CapWarningTranslate): string[] {
  const blocked = blockedCategories(state);
  return CATEGORIES.filter(
    (category) => state.selected.includes(category) && blocked.includes(category),
  ).map((category) =>
    t('track.capReached', { 0: t(`categories.${category}`), 1: t(capPeriodKey(category)) }),
  );
}

export function toggleCategory(state: VerdictState, category: Category): VerdictState {
  const selected = state.selected.includes(category)
    ? state.selected.filter((entry) => entry !== category)
    : canonical([...state.selected, category]);
  return { ...state, selected, errorKey: null };
}

export function setEditingCategories(state: VerdictState, isEditing: boolean): VerdictState {
  return { ...state, isEditingCategories: isEditing };
}

/** Clearing the name clears the source too: "somewhere, unnamed" is not a place. */
export function applyPlace(state: VerdictState, name: string | null, source: PlaceSource): VerdictState {
  return { ...state, placeName: name, placeSource: name === null ? 'none' : source, errorKey: null };
}

/**
 * The text is kept exactly as typed while the sheet is open — trimming on every keystroke would
 * eat the space the member is about to follow with a word — and only normalised on the way out.
 */
export function applyTitle(state: VerdictState, title: string): VerdictState {
  return { ...state, title, errorKey: null };
}

export function applyNote(state: VerdictState, note: string): VerdictState {
  return { ...state, note, errorKey: null };
}

/** The `PATCH /entries/:id` body this sheet's state amounts to. */
export function patchBody(state: VerdictState) {
  return {
    categories: state.selected,
    placeName: state.placeName,
    placeSource: state.placeSource,
    title: normalizeText(state.title),
    note: normalizeText(state.note),
  };
}

export function beginSave(state: VerdictState): VerdictState {
  return { ...state, isSaving: true, errorKey: null };
}

export function failSave(state: VerdictState, error: unknown): VerdictState {
  return { ...state, isSaving: false, errorKey: describeError(error) };
}

/**
 * Adopts a `PATCH /entries/:id` response as the new baseline, so `hasChanges` clears and the
 * projection reflects the server's post-save numbers. For a history edit this is the first real
 * projection the sheet has ever had (ruling 2), which is what flips `hasConfirmedProjection`.
 */
export function adoptConfirmation(state: VerdictState, response: EntryMutationResponse): VerdictState {
  const selected = canonical(response.entry.categories);
  return {
    ...state,
    isSaving: false,
    errorKey: null,
    confirmedEntry: response.entry,
    capsHit: response.capsHit,
    cappedCategories: canonical(response.cappedCategories),
    projectedPoints: response.projectedPoints,
    placeName: response.entry.placeName,
    placeSource: response.entry.placeSource,
    title: response.entry.title,
    note: response.entry.note,
    selected,
    initialSelection: selected,
    initialPlaceName: response.entry.placeName,
    initialPlaceSource: response.entry.placeSource,
    initialTitle: response.entry.title,
    initialNote: response.entry.note,
    hasConfirmedProjection: true,
  };
}

/**
 * Claims the one celebration this sheet owes, answering `true` exactly once: a re-render, or a
 * picker closing back over the sheet, must never replay it. Swift's `markCelebrated()`.
 */
export function claimCelebration(state: VerdictState): { state: VerdictState; celebrate: boolean } {
  if (state.didCelebrate) return { state, celebrate: false };
  return { state: { ...state, didCelebrate: true }, celebrate: true };
}
