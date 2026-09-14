import type { ReactNode } from 'react';
import { cn } from './cn';
import { progressFraction } from './progress-bar';

export interface ProgressRingProps {
  value: number;
  max: number;
  /** Outer diameter in px. iOS's default is 72. */
  size?: number;
  /** iOS's `lineWidth`, default 8. */
  strokeWidth?: number;
  label?: string;
  /** Rendered centred inside the ring — the big numeral on Trends. */
  children?: ReactNode;
  className?: string;
}

/**
 * The progress-ring spec: a `track` circle with a rounded `primary` arc and a value in the middle.
 * Port of `ProgressRing` (ios/SkinnyLegend/Core/DesignSystem/Progress.swift) — same 12 o'clock
 * start (`-90°`) and round line cap.
 */
export function ProgressRing({
  value,
  max,
  size = 72,
  strokeWidth = 8,
  label,
  children,
  className,
}: ProgressRingProps) {
  const fraction = progressFraction(value, max);
  const clamped = max > 0 ? Math.min(max, Math.max(0, value)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * fraction;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      data-slot="progress-ring"
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        data-testid="progress-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
        // The arc is drawn from 12 o'clock, like the SwiftUI `.rotationEffect(.degrees(-90))`.
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--track)"
          strokeWidth={strokeWidth}
        />
        <circle
          data-testid="progress-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      {children ? <div className="absolute inset-0 flex items-center justify-center">{children}</div> : null}
    </div>
  );
}
