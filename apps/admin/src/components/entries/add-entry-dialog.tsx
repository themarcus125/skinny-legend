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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminEntryInput, AdminUser } from '@/lib/api/types';
import { fromChallengeInput, toChallengeInput } from '@/lib/format';
import { EntryFields, timeProblem, type ChallengeWindow, type EntryDraft } from './entry-fields';

/** What the API will take as an entry photo from a desktop browser, which cannot decode HEIC. */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

interface AddEntryDialogProps {
  open: boolean;
  members: AdminUser[];
  challenge?: ChallengeWindow | null;
  /** Injected so the default time and the "not in the future" rule are testable. */
  now?: Date;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: AdminEntryInput, photo: File | null) => void;
}

/**
 * Logs an entry on a member's behalf — they forgot, or their photo carried the wrong date. The
 * entry is confirmed the moment it is saved, so everything that decides its points is asked for
 * here; the photo is optional.
 */
export function AddEntryDialog({ open, ...props }: AddEntryDialogProps) {
  // Mounted per opening, so a cancelled draft never leaks into the next one.
  return open ? <AddEntryDialogBody {...props} /> : null;
}

function AddEntryDialogBody({
  members,
  challenge,
  now = new Date(),
  isSaving,
  onClose,
  onSave,
}: Omit<AddEntryDialogProps, 'open'>) {
  const t = useTranslations();
  // Only an active member is on the board, so only they can be given an entry.
  const active = members.filter((member) => member.status === 'active');
  const memberItems: Record<string, string> = {};
  for (const member of active) memberItems[member.id] = member.displayName;

  const [userId, setUserId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [draft, setDraft] = useState<EntryDraft>(() => ({
    time: toChallengeInput(now.toISOString()),
    categories: [],
    title: '',
    note: '',
    placeName: '',
  }));

  const takenAt = fromChallengeInput(draft.time);
  const ready = userId !== null && draft.categories.length > 0 && takenAt !== null && timeProblem(draft.time, now) === null;

  function save() {
    if (!ready || userId === null || takenAt === null) return;
    const title = draft.title.trim();
    const note = draft.note.trim();
    const placeName = draft.placeName.trim();
    onSave(
      {
        userId,
        takenAt,
        categories: draft.categories,
        ...(title ? { title } : {}),
        ...(note ? { note } : {}),
        ...(placeName ? { placeName } : {}),
      },
      photo,
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('entries.addTitle')}</DialogTitle>
          <DialogDescription>{t('entries.addDescription')}</DialogDescription>
        </DialogHeader>

        <div data-testid="add-entry-form" data-member-count={active.length} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-member">{t('common.member')}</Label>
            <Select items={memberItems} value={userId} onValueChange={(next) => setUserId(next as string | null)}>
              <SelectTrigger id="add-member" className="w-full">
                <SelectValue placeholder={t('entries.pickMember')} />
              </SelectTrigger>
              <SelectContent>
                {active.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <EntryFields idPrefix="add" draft={draft} onChange={setDraft} challenge={challenge} now={now} />

          <div className="space-y-1.5">
            <Label htmlFor="add-photo">{t('entries.photoOptional')}</Label>
            <Input
              id="add-photo"
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!ready || isSaving} onClick={save}>
            {t('entries.addSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
