'use client';

import { useState } from 'react';
import { cn } from './cn';

export interface AvatarProps {
  name: string;
  src?: string | null;
  /** Diameter in px; iOS's default is 40. */
  size?: number;
  className?: string;
}

/**
 * Port of `AvatarView.initials` (ios/SkinnyLegend/Core/DesignSystem/AvatarView.swift): the first
 * letter of each of the last two words, uppercased, falling back to "?".
 */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(-2).map((word) => [...word][0] ?? '');
  const joined = letters.join('');
  return joined === '' ? '?' : joined.toLocaleUpperCase();
}

/**
 * Circular avatar; falls back to initials on the accent soft tint. Port of `AvatarView`
 * (ios/SkinnyLegend/Core/DesignSystem/AvatarView.swift), hairline ring included — the fallback
 * fill is `primary-soft`, which would otherwise vanish on the leaderboard's own "you" row.
 */
export function Avatar({ name, src, size = 40, className }: AvatarProps) {
  // A broken or expired photo URL must degrade to the initials rather than to the browser's
  // alt-text box — avatar URLs are signed and outlive their signature. Remembering *which* URL
  // failed rather than a bare `broken` flag means a later, different URL gets a fresh chance
  // without an effect resetting the flag on every `src` change.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && src !== failedSrc;
  return (
    <span
      data-testid="avatar"
      data-slot="avatar"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary-border bg-primary-soft',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        // A plain <img>, not next/image: this package is consumed by Vite as well as Next.
        <img
          src={src ?? undefined}
          alt={name}
          width={size}
          height={size}
          onError={() => setFailedSrc(src ?? null)}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-bold text-foreground"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

export interface AvatarStackProps {
  people: Array<{ name: string; src?: string | null }>;
  /** Faces shown before the overflow pill. */
  max?: number;
  size?: number;
  className?: string;
}

/** Overlapping faces with a `+N` pill for the remainder. Web-only; iOS has no stacked variant. */
export function AvatarStack({ people, max = 3, size = 28, className }: AvatarStackProps) {
  const shown = people.slice(0, Math.max(0, max));
  const overflow = people.length - shown.length;
  return (
    <div data-slot="avatar-stack" className={cn('flex items-center -space-x-2', className)}>
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          src={person.src}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {overflow > 0 ? (
        <span
          data-testid="avatar-stack-overflow"
          className="type-label inline-flex items-center justify-center rounded-full border border-border bg-surface-2 px-2 text-foreground-secondary ring-2 ring-card"
          style={{ height: size }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
