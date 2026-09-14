'use client';

import type { ReactNode } from 'react';
import { CircleAlertIcon, InboxIcon, Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { describeError } from '@/lib/api';

export function QueryState({
  isPending,
  error,
  isEmpty,
  emptyLabel,
  emptyAction,
  children,
}: {
  isPending: boolean;
  error: Error | null;
  isEmpty: boolean;
  /** Already-translated copy; each caller passes its own `t('…')`. */
  emptyLabel: string;
  /** Optional primary action for the empty state (the design system's empty-state spec). */
  emptyAction?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations();
  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted-foreground">
        <Loader2Icon aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        {t('common.loading')}
      </p>
    );
  }
  if (error) {
    // Never render error.message: the API speaks English; describeError maps the code to a catalogue key.
    // Alert spec: soft destructive fill, icon at the optical top, radius md.
    return (
      <p
        role="alert"
        className="mx-5 my-6 flex items-start gap-2.5 rounded-md bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
      >
        <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t(describeError(error))}
      </p>
    );
  }
  if (isEmpty) {
    // Empty-state spec: mark, one-line title, and room for a single primary action.
    return (
      <div className="flex flex-col items-center px-5 py-16 text-center">
        <span
          aria-hidden
          className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-foreground-subtle"
        >
          <InboxIcon className="size-5" />
        </span>
        <p className="type-h3 max-w-sm text-balance text-foreground">{emptyLabel}</p>
        {emptyAction ? <div className="mt-5">{emptyAction}</div> : null}
      </div>
    );
  }
  return <>{children}</>;
}
