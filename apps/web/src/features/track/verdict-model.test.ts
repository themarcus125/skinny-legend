import { describe, expect, it } from 'vitest';
import type { Category, EntryDto, VerdictDto } from '@skinny/shared/wire';
import { ApiError } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { translator } from '@/test/intl';
import {
  adoptConfirmation,
  applyPlace,
  beginSave,
  blockedCategories,
  canSave,
  capWarnings,
  claimCelebration,
  failSave,
  hasChanges,
  initVerdictState,
  isAlreadyTracked,
  isCapped,
  needsSave,
  outcome,
  projectedPoints,
  toggleCategory,
  verdictOf,
  type VerdictModelInit,
  type VerdictState,
} from './verdict-model';

/**
 * The port of `ios/SkinnyLegendTests/VerdictSheetModelTests.swift`, case for case. The Swift
 * cases that call `model.confirm()` become "feed the mock's `PATCH` response through
 * `adoptConfirmation`" here, because the component — not the state machine — owns the request.
 */
const SEED_DAY = '2026-09-14';
const t = translator();

const entry = (over: Partial<EntryDto> = {}): EntryDto => ({
  id: 'e1',
  userId: 'u1',
  photoUrl: 'x',
  thumbUrl: null,
  takenAt: '2026-09-14T03:00:00.000Z',
  localDate: '2026-09-14',
  status: 'confirmed',
  categories: ['exercise'],
  placeName: null,
  placeSource: 'none',
  createdAt: '2026-09-14T03:00:01.000Z',
  ...over,
});

const verdict = (over: Partial<VerdictDto> = {}): VerdictDto => ({
  categories: ['exercise'],
  healthy: null,
  confidence: 0.9,
  reason: 'r',
  model: 'm',
  failed: false,
  ...over,
});

const noCaps: Record<Category, boolean> = { exercise: false, meal: false, group: false };

const created = (over: Partial<VerdictModelInit> = {}): VerdictState =>
  initVerdictState({
    entry: entry(),
    mode: { kind: 'created', verdict: verdict() },
    capsHit: noCaps,
    cappedCategories: [],
    projectedPoints: 2,
    placeName: null,
    placeSource: 'none',
    ...over,
  });

/** Built through the catalog like the model's own copy, so the assertion cannot drift from it. */
const capWarning = (category: Category, period: 'Day' | 'Week') =>
  t('track.capReached', {
    0: t(`categories.${category}`),
    1: t(`overview.capPeriod${period}`),
  });

/** The mock's every-fifth-entry failing verdict, reached by counting createEntry calls. */
async function createUntilFailed() {
  const api = createMockApiClient({ seed: makeSeed(SEED_DAY) });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await api.createEntry({
      photoKey: 'photos/x.jpg',
      takenAt: '2026-09-14T03:00:00.000Z',
    });
    if (response.verdict?.failed) return { api, response };
  }
  throw new Error('the mock never produced a failing verdict');
}

describe('opening state', () => {
  it("starts from the AI's categories and the server's projected points", () => {
    const s = created();
    expect(s.selected).toEqual(['exercise']);
    expect(projectedPoints(s)).toBe(2);
    expect(s.isEditingCategories).toBe(false);
    expect(capWarnings(s, t)).toEqual([]);
  });

  it('a failed verdict opens the chip editor with nothing selected and stays pending', () => {
    const s = created({
      entry: entry({ status: 'pending', categories: [] }),
      mode: { kind: 'created', verdict: verdict({ failed: true, categories: [] }) },
      projectedPoints: 0,
    });
    expect(s.selected).toEqual([]);
    expect(s.isEditingCategories).toBe(true);
    expect(isAlreadyTracked(s)).toBe(false);
    expect(needsSave(s)).toBe(true);
    expect(canSave(s)).toBe(false); // the server requires ≥ 1 category
    expect(projectedPoints(s)).toBe(0);
  });

  it('an edit-mode sheet starts from the stored entry with no verdict', () => {
    const s = initVerdictState({
      entry: entry({ categories: ['meal'], placeName: 'Cơm tấm Ba Ghiền', placeSource: 'poi' }),
      mode: { kind: 'edit' },
      capsHit: noCaps,
      cappedCategories: [],
      projectedPoints: 2,
      placeName: 'Cơm tấm Ba Ghiền',
      placeSource: 'poi',
    });
    expect(s.selected).toEqual(['meal']);
    expect(verdictOf(s)).toBeNull();
    expect(s.isEditingCategories).toBe(true);
    expect(s.placeName).toBe('Cơm tấm Ba Ghiền');
  });
});

describe('already-tracked entries', () => {
  it('a successful verdict opens on an already-tracked entry with nothing to save', () => {
    const s = created();
    expect(isAlreadyTracked(s)).toBe(true);
    expect(hasChanges(s)).toBe(false);
    expect(needsSave(s)).toBe(false);
    expect(outcome(s)).toBe('tracked');
  });

  it('a confirmed-status entry with a failed verdict is not treated as tracked', () => {
    const s = created({ mode: { kind: 'created', verdict: verdict({ failed: true }) } });
    expect(isAlreadyTracked(s)).toBe(false);
    expect(outcome(s)).toBe('abandoned');
    expect(needsSave(s)).toBe(true);
  });

  it('correcting a tracked entry needs saving, and an empty correction is refused', () => {
    let s = toggleCategory(created(), 'meal');
    expect(hasChanges(s)).toBe(true);
    expect(needsSave(s)).toBe(true);
    expect(canSave(s)).toBe(true);
    s = toggleCategory(toggleCategory(s, 'meal'), 'exercise');
    expect(s.selected).toEqual([]);
    expect(canSave(s)).toBe(false);
  });

  it('a tracked entry cannot be corrected down to no categories, but any non-empty one is fine', () => {
    let s = created();
    expect(canSave(s)).toBe(true); // "Xong" just dismisses
    s = toggleCategory(s, 'exercise');
    expect(s.selected).toEqual([]);
    expect(needsSave(s)).toBe(true);
    expect(canSave(s)).toBe(false);
    s = toggleCategory(s, 'meal');
    expect(canSave(s)).toBe(true);
  });

  it('an empty selection is never saveable, in edit mode either', () => {
    const edit = toggleCategory(
      initVerdictState({
        entry: entry({ categories: ['meal'] }),
        mode: { kind: 'edit' },
        capsHit: noCaps,
        cappedCategories: [],
        projectedPoints: 2,
        placeName: null,
        placeSource: 'none',
      }),
      'meal',
    );
    expect(edit.selected).toEqual([]);
    expect(canSave(edit)).toBe(false);
  });

  it('an edit-mode sheet always needs saving even before any change', () => {
    const s = initVerdictState({
      entry: entry({ categories: ['meal'] }),
      mode: { kind: 'edit' },
      capsHit: noCaps,
      cappedCategories: [],
      projectedPoints: 2,
      placeName: null,
      placeSource: 'none',
    });
    expect(isAlreadyTracked(s)).toBe(false);
    expect(hasChanges(s)).toBe(false);
    expect(needsSave(s)).toBe(true);
  });
});

describe('place', () => {
  it('changing only the place of a tracked entry is a correction that needs saving', () => {
    const s = applyPlace(created(), 'Công viên Gia Định', 'osm');
    expect(hasChanges(s)).toBe(true);
    expect(needsSave(s)).toBe(true);
  });

  it('clearing the place name forces the source back to none', () => {
    expect(applyPlace(created(), null, 'osm').placeSource).toBe('none');
  });
});

describe('caps and projection', () => {
  it('toggling a chip re-projects the points locally', () => {
    let s = created({
      entry: entry({ categories: ['exercise', 'group'] }),
      mode: { kind: 'created', verdict: verdict({ categories: ['exercise', 'group'] }) },
      capsHit: { ...noCaps, exercise: true },
      projectedPoints: 6,
    });
    s = toggleCategory(s, 'group');
    expect(s.selected).toEqual(['exercise']);
    // exercise filled its own cap, so it is not blocked when it stays selected.
    expect(projectedPoints(s)).toBe(3);
    s = toggleCategory(s, 'meal');
    expect(s.selected).toEqual(['exercise', 'meal']);
    expect(projectedPoints(s)).toBe(5);
  });

  it('a category the server capped for this entry scores nothing and warns', () => {
    let s = created({
      entry: entry({ categories: ['exercise'] }),
      capsHit: { ...noCaps, exercise: true },
      cappedCategories: ['exercise'],
      projectedPoints: 0,
    });
    expect(blockedCategories(s)).toEqual(['exercise']);
    expect(projectedPoints(s)).toBe(0);
    expect(capWarnings(s, t)).toEqual([capWarning('exercise', 'Day')]);
    s = toggleCategory(s, 'meal');
    expect(projectedPoints(s)).toBe(2); // meal is not blocked
  });

  it('the weekly group cap warns with the week wording', () => {
    const s = created({
      entry: entry({ categories: ['group'] }),
      mode: { kind: 'created', verdict: verdict({ categories: ['group'] }) },
      capsHit: { ...noCaps, group: true },
      cappedCategories: ['group'],
      projectedPoints: 0,
    });
    expect(capWarnings(s, t)).toEqual([capWarning('group', 'Week')]);
  });

  it('a mixed entry blocks only the category the server actually capped', () => {
    let s = created({
      entry: entry({ categories: ['exercise', 'meal'] }),
      mode: { kind: 'created', verdict: verdict({ categories: ['exercise', 'meal'] }) },
      capsHit: { ...noCaps, exercise: true, meal: true },
      cappedCategories: ['meal'],
      projectedPoints: 3,
    });
    expect(projectedPoints(s)).toBe(3);
    expect(isCapped(s, 'meal')).toBe(true);
    expect(isCapped(s, 'exercise')).toBe(false);
    expect(capWarnings(s, t)).toEqual([capWarning('meal', 'Day')]);

    s = toggleCategory(s, 'meal'); // deselect the already-capped meal
    expect(s.selected).toEqual(['exercise']);
    expect(projectedPoints(s)).toBe(3);

    s = toggleCategory(s, 'group'); // group's cap is free, so it scores
    expect(s.selected).toEqual(['exercise', 'group']);
    expect(projectedPoints(s)).toBe(6);
  });

  it('a category filled by other entries stays blocked when added back after an edit', () => {
    const s = toggleCategory(created({ capsHit: { ...noCaps, group: true } }), 'group');
    expect(blockedCategories(s)).toContain('group');
  });

  it('an edit-mode sheet ignores caller-supplied caps before save and reflects the PATCH response after', () => {
    const s = initVerdictState({
      entry: entry(),
      mode: { kind: 'edit' },
      capsHit: { ...noCaps, exercise: true },
      cappedCategories: ['exercise'],
      projectedPoints: 0,
      placeName: null,
      placeSource: 'none',
    });
    expect(blockedCategories(s)).toEqual([]);
    expect(needsSave(s)).toBe(true);
    expect(s.hasConfirmedProjection).toBe(false);

    const after = adoptConfirmation(s, {
      entry: entry(),
      projectedPoints: 2,
      capsHit: noCaps,
      cappedCategories: [],
    });
    expect(after.hasConfirmedProjection).toBe(true);
    expect(hasChanges(after)).toBe(false);
    expect(projectedPoints(after)).toBe(2);
    expect(outcome(after)).toBe('confirmedByHand');
  });
});

describe('saving against the mock client', () => {
  it('correcting a tracked entry PATCHes and clears the pending change', async () => {
    const api = createMockApiClient({ seed: makeSeed(SEED_DAY) });
    const response = await api.createEntry({
      photoKey: 'photos/x.jpg',
      takenAt: '2026-09-14T03:00:00.000Z',
    });
    // The API now creates entries pending; the already-tracked branch is kept for a server that
    // answers `confirmed`, so this test stands one up by hand.
    expect(response.entry.status).toBe('pending');
    let s = initVerdictState({
      entry: { ...response.entry, status: 'confirmed' },
      mode: { kind: 'created', verdict: response.verdict! },
      capsHit: response.capsHit,
      cappedCategories: response.cappedCategories,
      projectedPoints: response.projectedPoints,
      placeName: null,
      placeSource: 'none',
    });
    expect(isAlreadyTracked(s)).toBe(true);
    expect(needsSave(s)).toBe(false);

    s = toggleCategory(s, 'meal');
    expect(hasChanges(s)).toBe(true);
    expect(needsSave(s)).toBe(true);

    s = adoptConfirmation(
      s,
      await api.confirmEntry(s.entry.id, { categories: s.selected, placeSource: 'none' }),
    );
    expect(s.confirmedEntry?.categories).toContain('meal');
    expect(s.errorKey).toBeNull();
    expect(hasChanges(s)).toBe(false);
    expect(needsSave(s)).toBe(false);
    // Still tracked: the entry counted when it was created, so the screen must not celebrate
    // a second time for the correction.
    expect(outcome(s)).toBe('tracked');
  });

  it('a pending entry confirmed by hand reports confirmedByHand, and abandoned otherwise', async () => {
    const { api, response } = await createUntilFailed();
    expect(response.entry.status).toBe('pending');
    expect(response.entry.categories).toEqual([]);

    let s = initVerdictState({
      entry: response.entry,
      mode: { kind: 'created', verdict: response.verdict! },
      capsHit: response.capsHit,
      cappedCategories: response.cappedCategories,
      projectedPoints: response.projectedPoints,
      placeName: null,
      placeSource: 'none',
    });
    expect(isAlreadyTracked(s)).toBe(false);
    expect(s.isEditingCategories).toBe(true);
    expect(outcome(s)).toBe('abandoned');

    s = toggleCategory(s, 'exercise');
    expect(outcome(s)).toBe('abandoned'); // a selection alone does not confirm it
    s = adoptConfirmation(
      s,
      await api.confirmEntry(s.entry.id, { categories: s.selected, placeSource: 'none' }),
    );
    expect(s.confirmedEntry?.status).toBe('confirmed');
    expect(s.confirmedEntry?.categories).toEqual(['exercise']);
    expect(outcome(s)).toBe('confirmedByHand');
  });

  it('a failed PATCH surfaces the error key and leaves the sheet unconfirmed', () => {
    const saving = beginSave(created());
    expect(saving.isSaving).toBe(true);
    expect(canSave(saving)).toBe(false);
    const failed = failSave(saving, new ApiError(404, 'not_found', 'Entry not found'));
    expect(failed.isSaving).toBe(false);
    expect(failed.errorKey).toBe('errors.not_found');
    expect(failed.confirmedEntry).toBeNull();
  });
});

describe('celebration', () => {
  it('is claimed exactly once', () => {
    const first = claimCelebration(created());
    expect(first.celebrate).toBe(true);
    const second = claimCelebration(first.state);
    expect(second.celebrate).toBe(false);
    expect(claimCelebration(second.state).celebrate).toBe(false);
  });
});
