import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  /** The caller's mark — this package ships no icon library. Rendered decoratively. */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * The empty-state spec. Port of iOS's `emptyStateStyle()` over `ContentUnavailableView`
 * (ios/SkinnyLegend/Core/DesignSystem/SurfaceCard.swift, used e.g. by
 * Features/Auth/PendingApprovalView.swift): the mark is `foreground-subtle` decoration, the title
 * is read at `h3`, and the description takes `foreground-secondary` — never `foreground-subtle`,
 * which is 3.51:1 in light and decoration only (docs/design-system/tokens.md).
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      data-slot="empty-state"
      className={cn('flex w-full flex-col items-center gap-3 px-6 py-12 text-center', className)}
    >
      {icon ? (
        <span aria-hidden="true" className="text-foreground-subtle">
          {icon}
        </span>
      ) : null}
      <p className="type-h3 font-heading text-foreground">{title}</p>
      {description ? (
        <p data-testid="empty-state-description" className="type-body max-w-prose text-foreground-secondary">
          {description}
        </p>
      ) : null}
      {action ? (
        <div data-testid="empty-state-action" className="mt-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}
