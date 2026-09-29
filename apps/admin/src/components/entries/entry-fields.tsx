'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CATEGORIES, type Category } from '@/lib/api/types';
import { formatLocalDate, fromChallengeInput } from '@/lib/format';
import { CATEGORY_LABELS } from '@/lib/labels';

/** Mirrors `ENTRY_TITLE_MAX` / `ENTRY_NOTE_MAX` and the place column's 120 on the wire. */
export const TITLE_MAX = 80;
export const NOTE_MAX = 500;
export const PLACE_MAX = 120;

/** The challenge window as the rules endpoint reports it: two `YYYY-MM-DD` days, inclusive. */
export interface ChallengeWindow {
  startDate: string;
  endDate: string;
}

/** What the dialogs hold while the admin types; `time` is a `datetime-local` value. */
export interface EntryDraft {
  time: string;
  categories: Category[];
  title: string;
  note: string;
  placeName: string;
}

/** Why a draft's time cannot be saved yet, as a catalog key — or null when it can. */
export function timeProblem(time: string, now: Date): 'entries.timeRequired' | 'entries.timeFuture' | null {
  const iso = fromChallengeInput(time);
  if (!iso) return 'entries.timeRequired';
  return new Date(iso).getTime() > now.getTime() ? 'entries.timeFuture' : null;
}

/** The draft's day falls outside the challenge, so the entry would be saved and score nothing. */
export function isOutsideChallenge(time: string, challenge: ChallengeWindow | null | undefined): boolean {
  if (!challenge || !fromChallengeInput(time)) return false;
  const day = time.slice(0, 10);
  return day < challenge.startDate || day > challenge.endDate;
}

/**
 * The fields the add and edit dialogs share: when it happened, what it counts as, and the
 * member-facing text. `idPrefix` keeps the two dialogs' ids apart.
 */
export function EntryFields({
  idPrefix,
  draft,
  onChange,
  challenge,
  now,
}: {
  idPrefix: string;
  draft: EntryDraft;
  onChange: (next: EntryDraft) => void;
  challenge?: ChallengeWindow | null;
  now: Date;
}) {
  const t = useTranslations();
  const problem = timeProblem(draft.time, now);

  function toggle(category: Category, on: boolean) {
    onChange({
      ...draft,
      categories: on
        ? [...new Set([...draft.categories, category])]
        : draft.categories.filter((item) => item !== category),
    });
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-time`}>{t('entries.time')}</Label>
        <Input
          id={`${idPrefix}-time`}
          type="datetime-local"
          value={draft.time}
          aria-invalid={problem !== null}
          aria-describedby={`${idPrefix}-time-hint`}
          onChange={(event) => onChange({ ...draft, time: event.target.value })}
        />
        <p id={`${idPrefix}-time-hint`} className="text-label text-muted-foreground">
          {problem ? <span className="text-destructive">{t(problem)}</span> : t('entries.timeHint')}
        </p>
        {isOutsideChallenge(draft.time, challenge) && challenge ? (
          <p data-testid="outside-challenge" role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
            {t('entries.outsideChallenge', {
              start: formatLocalDate(challenge.startDate),
              end: formatLocalDate(challenge.endDate),
            })}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        {CATEGORIES.map((category) => (
          <div key={category} className="flex h-11 items-center justify-between rounded-md px-3 hover:bg-surface-2">
            <label htmlFor={`${idPrefix}-cat-${category}`} className="text-base">
              {t(CATEGORY_LABELS[category])}
            </label>
            <Switch
              id={`${idPrefix}-cat-${category}`}
              checked={draft.categories.includes(category)}
              onCheckedChange={(on) => toggle(category, on)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title`}>{t('entries.entryTitle')}</Label>
        <Input
          id={`${idPrefix}-title`}
          maxLength={TITLE_MAX}
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`}>{t('entries.note')}</Label>
        <textarea
          id={`${idPrefix}-note`}
          rows={3}
          maxLength={NOTE_MAX}
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-foreground-subtle hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-place`}>{t('entries.place')}</Label>
        <Input
          id={`${idPrefix}-place`}
          maxLength={PLACE_MAX}
          value={draft.placeName}
          onChange={(event) => onChange({ ...draft, placeName: event.target.value })}
        />
      </div>
    </>
  );
}
