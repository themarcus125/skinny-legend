'use client';

import { useTranslations } from 'next-intl';
import { CategoryChips } from '@/components/category-chips';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminEntry } from '@/lib/api/types';
import { formatLocalDate } from '@/lib/format';
import { ENTRY_STATUS_LABELS } from '@/lib/labels';
import { verdictSummary } from './filters';

export function EntriesTable({
  entries,
  onOverride,
  onReject,
  isMutating,
}: {
  entries: AdminEntry[];
  onOverride: (entry: AdminEntry) => void;
  onReject: (entry: AdminEntry) => void;
  isMutating: boolean;
}) {
  const t = useTranslations();
  return (
    <Table containerClassName="md:max-h-[calc(100dvh-17rem)]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">{t('common.photo')}</TableHead>
          <TableHead>{t('common.member')}</TableHead>
          <TableHead className="w-28">{t('common.date')}</TableHead>
          <TableHead className="w-40">{t('common.category')}</TableHead>
          <TableHead>{t('common.status')}</TableHead>
          <TableHead className="w-56">{t('entries.aiVerdict')}</TableHead>
          <TableHead className="text-right">{t('common.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const summary = verdictSummary(entry.verdict, t);
          return (
            <TableRow key={entry.id}>
              <TableCell>
                {entry.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- R2 serves short-lived signed URLs; next/image would need remotePatterns and would cache them.
                  <img
                    src={entry.thumbUrl}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    decoding="async"
                    className="size-11 rounded-md object-cover ring-1 ring-border"
                  />
                ) : (
                  <div className="size-11 rounded-md bg-surface-2" role="img" aria-label={t('entries.noThumb')} />
                )}
              </TableCell>
              <TableCell className="text-base font-semibold text-foreground">{entry.user.displayName}</TableCell>
              <TableCell className="text-sm tabular-nums text-foreground-secondary">
                {formatLocalDate(entry.localDate)}
              </TableCell>
              <TableCell>
                <CategoryChips categories={entry.categories} />
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    entry.status === 'confirmed' ? 'success' : entry.status === 'pending' ? 'warning' : 'destructive'
                  }
                >
                  {t(ENTRY_STATUS_LABELS[entry.status])}
                </Badge>
              </TableCell>
              <TableCell className="w-56 max-w-56">
                <span className="block truncate text-sm text-foreground" title={summary}>
                  {summary}
                </span>
                {entry.verdict?.reason ? (
                  <span className="block truncate text-label text-foreground-subtle" title={entry.verdict.reason}>
                    {entry.verdict.reason}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <Button size="sm" variant="outline" disabled={isMutating} onClick={() => onOverride(entry)}>
                  {t('entries.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:border-destructive hover:bg-destructive-soft"
                  disabled={isMutating || entry.status === 'rejected'}
                  onClick={() => onReject(entry)}
                >
                  {t('entries.reject')}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
