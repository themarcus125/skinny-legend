'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { NotificationLogItem } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

export function NotificationLog({ items }: { items: NotificationLogItem[] }) {
  const t = useTranslations('notifications');
  return (
    <Table containerClassName="md:max-h-[calc(100dvh-19rem)]">
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.member')}</TableHead>
          <TableHead>{t('columns.kind')}</TableHead>
          <TableHead>{t('columns.platform')}</TableHead>
          <TableHead>{t('columns.content')}</TableHead>
          <TableHead>{t('columns.sentAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="text-base font-semibold text-foreground">{item.user.displayName}</TableCell>
            <TableCell>
              <Badge variant="info">{t(`kinds.${item.kind}`)}</Badge>
            </TableCell>
            {/* Neutral on purpose: the platform is context, not a state the admin must react to. */}
            <TableCell>
              <Badge variant="secondary">{t(`platform.${item.platform}`)}</Badge>
            </TableCell>
            <TableCell className="max-w-[28rem]">
              <p className="font-semibold text-foreground">{item.payload.title}</p>
              <p className="text-sm text-foreground-secondary">{item.payload.body}</p>
            </TableCell>
            <TableCell className="tabular-nums text-foreground-secondary">{formatDateTime(item.sentAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
