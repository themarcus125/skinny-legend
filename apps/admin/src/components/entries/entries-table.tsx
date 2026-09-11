'use client';

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
  return (
    <Table containerClassName="max-h-[calc(100dvh-17rem)]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Ảnh</TableHead>
          <TableHead>Thành viên</TableHead>
          <TableHead>Ngày</TableHead>
          <TableHead>Hạng mục</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Nhận định AI</TableHead>
          <TableHead className="text-right">Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              {entry.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- R2 serves short-lived signed URLs; next/image would need remotePatterns and would cache them.
                <img src={entry.thumbUrl} alt="" className="size-11 rounded-lg object-cover ring-1 ring-border" />
              ) : (
                <div className="size-11 rounded-lg bg-muted" role="img" aria-label="Không có ảnh thu nhỏ" />
              )}
            </TableCell>
            <TableCell className="font-medium text-foreground">{entry.user.displayName}</TableCell>
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
                {ENTRY_STATUS_LABELS[entry.status]}
              </Badge>
            </TableCell>
            <TableCell className="max-w-72">
              <span className="block text-sm text-foreground">{verdictSummary(entry.verdict)}</span>
              {entry.verdict?.reason ? (
                <span className="block truncate text-label text-muted-foreground">{entry.verdict.reason}</span>
              ) : null}
            </TableCell>
            <TableCell className="space-x-2 text-right">
              <Button size="sm" variant="outline" disabled={isMutating} onClick={() => onOverride(entry)}>
                Sửa
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:border-destructive/30 hover:bg-danger-soft"
                disabled={isMutating || entry.status === 'rejected'}
                onClick={() => onReject(entry)}
              >
                Từ chối
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
