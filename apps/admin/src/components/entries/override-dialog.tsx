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
import { Switch } from '@/components/ui/switch';
import { CATEGORIES, ENTRY_STATUSES, type AdminEntry, type Category, type EntryPatch, type EntryStatus } from '@/lib/api/types';
import { formatLocalDate } from '@/lib/format';
import { CATEGORY_LABELS, ENTRY_STATUS_LABELS, translateLabels } from '@/lib/labels';
import { verdictSummary } from './filters';

export function OverrideDialog({
  entry,
  onClose,
  onSave,
  isSaving,
}: {
  entry: AdminEntry | null;
  onClose: () => void;
  onSave: (id: string, patch: EntryPatch) => void;
  isSaving: boolean;
}) {
  // Remount on a different entry so the local draft always starts from that row.
  return entry ? (
    <OverrideDialogBody key={entry.id} entry={entry} onClose={onClose} onSave={onSave} isSaving={isSaving} />
  ) : null;
}

function OverrideDialogBody({
  entry,
  onClose,
  onSave,
  isSaving,
}: {
  entry: AdminEntry;
  onClose: () => void;
  onSave: (id: string, patch: EntryPatch) => void;
  isSaving: boolean;
}) {
  const t = useTranslations();
  const [categories, setCategories] = useState<Category[]>(entry.categories);
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const statusItems = translateLabels(ENTRY_STATUS_LABELS, t);

  function toggle(category: Category, on: boolean) {
    setCategories((current) =>
      on ? [...new Set([...current, category])] : current.filter((item) => item !== category),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('entries.editCategories')}</DialogTitle>
          <DialogDescription>
            {entry.user.displayName} · {formatLocalDate(entry.localDate)} · AI: {verdictSummary(entry.verdict, t)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- R2 serves short-lived signed URLs; next/image would need remotePatterns and would cache them. */}
          <img
            src={entry.photoUrl}
            alt={t('entries.photoOf', { name: entry.user.displayName })}
            className="h-40 w-full rounded-md object-cover ring-1 ring-border sm:h-52"
          />

          {entry.verdict?.reason ? (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-foreground-secondary">“{entry.verdict.reason}”</p>
          ) : null}

          <div className="space-y-1">
            {CATEGORIES.map((category) => (
              <div key={category} className="flex h-11 items-center justify-between rounded-md px-3 hover:bg-surface-2">
                <label htmlFor={`cat-${category}`} className="text-base">
                  {t(CATEGORY_LABELS[category])}
                </label>
                <Switch
                  id={`cat-${category}`}
                  checked={categories.includes(category)}
                  onCheckedChange={(on) => toggle(category, on)}
                />
              </div>
            ))}
          </div>

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
          <Button disabled={isSaving} onClick={() => onSave(entry.id, { categories, status })}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
