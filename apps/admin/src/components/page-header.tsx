import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="type-h1 text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-base text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

/** Right-slot count pill: only rendered where the number carries information. */
export function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="type-label inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-secondary-foreground">
      {children}
    </span>
  );
}
