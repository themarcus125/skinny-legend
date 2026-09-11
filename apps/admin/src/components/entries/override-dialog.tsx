'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CATEGORIES, ENTRY_STATUSES, type AdminEntry, type Category, type EntryPatch, type EntryStatus } from '@/lib/api/types';
import { formatLocalDate } from '@/lib/format';
import { CATEGORY_LABELS, ENTRY_STATUS_LABELS } from '@/lib/labels';
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
  const [categories, setCategories] = useState<Category[]>(entry.categories);
  const [status, setStatus] = useState<EntryStatus>(entry.status);

  function toggle(category: Category, on: boolean) {
    setCategories((current) =>
      on ? [...new Set([...current, category])] : current.filter((item) => item !== category),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa hạng mục</DialogTitle>
          <DialogDescription>
            {entry.user.displayName} · {formatLocalDate(entry.localDate)} · AI: {verdictSummary(entry.verdict)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- R2 serves short-lived signed URLs; next/image would need remotePatterns and would cache them. */}
          <img
            src={entry.photoUrl}
            alt={`Ảnh của ${entry.user.displayName}`}
            className="h-52 w-full rounded-lg object-cover ring-1 ring-border"
          />

          {entry.verdict?.reason ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground-secondary">“{entry.verdict.reason}”</p>
          ) : null}

          <div className="space-y-1">
            {CATEGORIES.map((category) => (
              <div key={category} className="flex h-10 items-center justify-between rounded-lg px-3 hover:bg-muted">
                <label htmlFor={`cat-${category}`} className="text-base">
                  {CATEGORY_LABELS[category]}
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
            <label className="text-label font-medium text-secondary-foreground" htmlFor="override-status">
              Trạng thái
            </label>
            <Select items={ENTRY_STATUS_LABELS} value={status} onValueChange={(next) => setStatus(next as EntryStatus)}>
              <SelectTrigger id="override-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ENTRY_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-label text-muted-foreground">
            Hạng mục sẽ được ghi với nguồn <code>admin</code> và điểm được tính lại ngay.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={isSaving} onClick={() => onSave(entry.id, { categories, status })}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
