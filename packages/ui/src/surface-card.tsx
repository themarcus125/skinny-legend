import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SurfaceCardProps {
  /** The accent (milestone) variant: `primary-soft` fill with the matching border. */
  accent?: boolean;
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
  className?: string;
}

/**
 * The design system's card: a flat `card` panel, hairline `border`, radius `lg` (18px), elevation
 * `e1`. Port of `SurfaceCard` (ios/SkinnyLegend/Core/DesignSystem/SurfaceCard.swift) — the padding
 * is the iOS `Space.x4 + 2` (18px) and the radius is `Theme.cardCornerRadius`.
 */
export function SurfaceCard({ accent = false, as: Tag = 'div', children, className }: SurfaceCardProps) {
  return (
    <Tag
      data-testid="surface-card"
      data-slot="surface-card"
      data-accent={accent ? 'true' : 'false'}
      className={cn(
        'rounded-xl border p-[18px] shadow-card',
        accent ? 'border-primary-border bg-primary-soft' : 'border-border bg-card text-card-foreground',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
