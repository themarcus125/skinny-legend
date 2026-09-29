'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENTRY_STATUSES, type AdminEntry, type EntryPatch, type EntryStatus } from '@/lib/api/types';
import { formatLocalDate, fromChallengeInput, toChallengeInput } from '@/lib/format';
import { ENTRY_STATUS_LABELS, translateLabels } from '@/lib/labels';
import { EntryFields, timeProblem, type ChallengeWindow, type EntryDraft } from './entry-fields';
import { verdictSummary } from './filters';

interface OverrideDialogProps {
  entry: AdminEntry | null;
  challenge?: ChallengeWindow | null;
  /** Injected so the "not in the future" rule is testable. */
  now?: Date;
  onClose: () => void;
  onSave: (id: string, patch: EntryPatch) => void;
  isSaving: boolean;
}

export function OverrideDialog({ entry, ...props }: OverrideDialogProps) {
  // Remount on a different entry so the local draft always starts from that row.
  return entry ? <OverrideDialogBody key={entry.id} entry={entry} {...props} /> : null;
}

function OverrideDialogBody({
  entry,
  challenge,
  now = new Date(),
  onClose,
  onSave,
  isSaving,
}: Omit<OverrideDialogProps, 'entry'> & { entry: AdminEntry }) {
  const t = useTranslations();
  const original = toChallengeInput(entry.takenAt);
  const [draft, setDraft] = useState<EntryDraft>({
    time: original,
    categories: entry.categories,
    title: entry.title ?? '',
    note: entry.note ?? '',
    placeName: entry.placeName ?? '',
  });
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const statusItems = translateLabels(ENTRY_STATUS_LABELS, t);

  // An entry keeps the time it already has, even one the clock has since made "future".
  const timeChanged = draft.time !== original;
  const canSave = !timeChanged || timeProblem(draft.time, now) === null;

  /** Only what the admin changed goes out, so an untouched field can never be overwritten. */
  function save() {
    const takenAt = timeChanged ? fromChallengeInput(draft.time) : null;
    const text = (next: string, was: string | null) => (next.trim() === (was ?? '') ? undefined : next.trim() || null);
    const title = text(draft.title, entry.title);
    const note = text(draft.note, entry.note);
    const placeName = text(draft.placeName, entry.placeName);
    onSave(entry.id, {
      categories: draft.categories,
      status,
      ...(takenAt ? { takenAt } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(placeName !== undefined ? { placeName } : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('entries.editEntry')}</DialogTitle>
          <DialogDescription>
            {entry.user.displayName} · {formatLocalDate(entry.localDate)} · AI: {verdictSummary(entry.verdict, t)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {entry.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- R2 serves short-lived signed URLs; next/image would need remotePatterns and would cache them.
            <img
              src={entry.photoUrl}
              alt={t('entries.photoOf', { name: entry.user.displayName })}
              className="h-40 w-full rounded-md object-cover ring-1 ring-border sm:h-52"
            />
          ) : (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-foreground-secondary">{t('entries.noPhoto')}</p>
          )}

          {entry.verdict?.reason ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-foreground-secondary">“{entry.verdict.reason}”</p>
          ) : null}

          <EntryFields idPrefix="override" draft={draft} onChange={setDraft} challenge={challenge} now={now} />

          <div className="space-y-1.5">
            <Label htmlFor="override-status">{t('common.status')}</Label>
            <Select items={statusItems} value={status} onValueChange={(next) => setStatus(next as EntryStatus)}>
              <SelectTrigger id="override-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {statusItems[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-label text-muted-foreground">
            {t.rich('entries.overrideNote', { code: (chunks) => <code>{chunks}</code> })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={isSaving || !canSave} onClick={save}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
