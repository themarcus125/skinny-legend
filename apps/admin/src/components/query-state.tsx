'use client';

import type { ReactNode } from 'react';
import { CircleAlertIcon, InboxIcon, Loader2Icon } from 'lucide-react';
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
  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-muted-foreground">
        <Loader2Icon aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Đang tải…
      </p>
    );
  }
  if (error) {
    // Never render error.message: the API speaks English, the dashboard speaks Vietnamese.
    return (
      <p
        role="alert"
        className="mx-5 my-6 flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-fg"
      >
        <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {describeError(error)}
      </p>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center px-5 py-14 text-center">
        <span
          aria-hidden
          className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <InboxIcon className="size-5" />
        </span>
        <p className="text-base text-foreground-secondary">{emptyLabel}</p>
      </div>
    );
  }
  return <>{children}</>;
}
