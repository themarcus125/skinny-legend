import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SurfaceCardProps {
  /** The accent (milestone) variant: `primary-soft` fill with the matching border. */
  accent?: boolean;
  /**
   * `none` drops the card's own inset so its children can own the edges — the list card whose
   * rows run full-bleed to the hairline, as `SurfaceCard(padding: 0)` does on iOS. `cn` joins,
   * it does not merge, so this is the supported way to unset the padding.
   */
  padding?: 'default' | 'none';
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
  className?: string;
}

/**
 * The design system's card: a flat `card` panel, hairline `border`, radius `lg` (18px), elevation
 * `e1`. Port of `SurfaceCard` (ios/SkinnyLegend/Core/DesignSystem/SurfaceCard.swift) — the padding
 * is the iOS `Space.x4 + 2` (18px) and the radius is `Theme.cardCornerRadius`.
 */
export function SurfaceCard({
  accent = false,
  padding = 'default',
  as: Tag = 'div',
  children,
  className,
}: SurfaceCardProps) {
  return (
    <Tag
      data-testid="surface-card"
      data-slot="surface-card"
      data-accent={accent ? 'true' : 'false'}
      data-padding={padding}
      className={cn(
        'rounded-xl border shadow-card',
        padding === 'none' ? 'p-0' : 'p-[18px]',
        accent ? 'border-primary-border bg-primary-soft' : 'border-border bg-card text-card-foreground',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
