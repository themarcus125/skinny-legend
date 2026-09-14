import { cn } from './cn';

/** The rulebook's streak cycle — `Rulebook.streakLength` on iOS. */
export const STREAK_CYCLE = 7;

export interface StreakCounterProps {
  days: number;
  longest: number;
  /** Defaults to the rulebook's 7-day bonus cycle. */
  cycle?: number;
  /** e.g. "ngày liên tiếp" — the caption beside the number. */
  daysLabel: string;
  /** e.g. "Dài nhất: 9 ngày" — already formatted by the caller. */
  longestLabel: string;
  /** e.g. "3 trên 7 ngày của chuỗi hiện tại" — the dot row's accessible name. */
  dotsLabel: string;
  className?: string;
}

/**
 * Port of `StreakCounter.filledDots` (ios/SkinnyLegend/Core/DesignSystem/StreakCounter.swift): a
 * live streak whose length is an exact multiple of the cycle shows a full row — the bonus day
 * itself — not an empty one.
 */
export function filledDots(days: number, cycle = STREAK_CYCLE): number {
  if (days <= 0 || cycle <= 0) return 0;
  const remainder = days % cycle;
  return remainder === 0 ? cycle : remainder;
}

/**
 * The design system's streak counter: a display-weight number, the "days in a row" caption, the
 * previous-best line, and a row of dots for the current streak week. Port of `StreakCounter`
 * (ios/SkinnyLegend/Core/DesignSystem/StreakCounter.swift).
 *
 * The dots are derived, not new data — `filledDots` is simply where the streak sits inside the
 * bonus cycle. The row is one `aria-label`'d element rather than N announced circles, mirroring
 * iOS's `.accessibilityElement(children: .ignore)`.
 */
export function StreakCounter({
  days,
  longest,
  cycle = STREAK_CYCLE,
  daysLabel,
  longestLabel,
  dotsLabel,
  className,
}: StreakCounterProps) {
  const alive = days > 0;
  const filled = filledDots(days, cycle);
  const dots = Array.from({ length: Math.max(0, cycle) }, (_, index) => index);
  return (
    <div
      data-testid="streak-counter"
      data-slot="streak-counter"
      data-alive={alive ? 'true' : 'false'}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'type-display text-[40px] tabular-nums',
            alive ? 'text-primary' : 'text-foreground-subtle',
          )}
        >
          {days}
        </span>
        <span className="type-caption text-foreground-secondary">{daysLabel}</span>
      </div>
      <p className="type-caption text-foreground-subtle">{longestLabel}</p>
      <div role="img" aria-label={dotsLabel} className="flex items-center gap-1.5">
        {dots.map((index) => (
          <span
            key={index}
            data-testid="streak-dot"
            data-filled={index < filled ? 'true' : 'false'}
            className={cn('size-2 rounded-full', index < filled ? 'bg-primary' : 'bg-track')}
          />
        ))}
      </div>
    </div>
  );
}
