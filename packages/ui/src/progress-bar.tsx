import { cn } from './cn';

export interface ProgressBarProps {
  value: number;
  max: number;
  /** Accessible name. Without it the bar is still a `progressbar`, just unnamed. */
  label?: string;
  className?: string;
}

/** Clamped 0…1; a non-positive `max` is empty rather than a division by zero. */
export function progressFraction(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/**
 * The bar-progress spec: a full-radius `track` rail with a `primary` fill. Port of `ProgressBar`
 * (ios/SkinnyLegend/Core/DesignSystem/Progress.swift), which takes a 0…1 progress; the web takes
 * `value`/`max` instead so the ARIA values are the real ones a screen reader reads out.
 */
export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const fraction = progressFraction(value, max);
  const clamped = max > 0 ? Math.min(max, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      data-slot="progress-bar"
      className={cn('h-2 w-full overflow-hidden rounded-full bg-track', className)}
    >
      <div
        data-testid="progress-bar-fill"
        className="h-full rounded-full bg-primary transition-[width] duration-[400ms] ease-out"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
