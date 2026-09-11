'use client';

import type { ReactNode } from 'react';
import { describeError } from '@/lib/api';

export function QueryState({
  isPending,
  error,
  isEmpty,
  emptyLabel,
  children,
}: {
  isPending: boolean;
  error: Error | null;
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  if (isPending) return <p className="py-8 text-sm text-muted-foreground">Đang tải…</p>;
  if (error) {
    // Never render error.message: the API speaks English, the dashboard speaks Vietnamese.
    return (
      <p role="alert" className="py-8 text-sm text-destructive">
        {describeError(error)}
      </p>
    );
  }
  if (isEmpty) return <p className="py-8 text-sm text-muted-foreground">{emptyLabel}</p>;
  return <>{children}</>;
}
