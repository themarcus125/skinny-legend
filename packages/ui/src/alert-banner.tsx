import type { ReactNode } from 'react';
import { cn } from './cn';
import { CheckCircleGlyph, InfoGlyph, OctagonAlertGlyph, WarningGlyph } from './icons';

export type AlertTone = 'success' | 'info' | 'warning' | 'destructive';

export interface AlertBannerProps {
  tone: AlertTone;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Soft fill + the matching strong ink. Exported so a swap here fails a test, not a screen. */
export const TONE_CLASS: Record<AlertTone, string> = {
  success: 'bg-success-soft text-success',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  destructive: 'bg-destructive-soft text-destructive',
};

const TONE_GLYPH: Record<AlertTone, typeof InfoGlyph> = {
  success: CheckCircleGlyph,
  info: InfoGlyph,
  warning: WarningGlyph,
  destructive: OctagonAlertGlyph,
};

/**
 * An inline alert / error banner: soft tint with the matching strong colour for glyph and text.
 * Port of `AlertBanner` (ios/SkinnyLegend/Core/DesignSystem/SurfaceCard.swift).
 *
 * Success and info are `role="status"` (polite): they confirm something the reader just did.
 * Warning and destructive are `role="alert"` (assertive): they interrupt, because the reader has
 * to act. The tone is the *only* signal on iOS, where the colour carries it; on the web the role
 * has to carry it too, since a screen reader never sees the tint.
 */
export function AlertBanner({ tone, title, description, action, className }: AlertBannerProps) {
  const Glyph = TONE_GLYPH[tone];
  return (
    <div
      role={tone === 'warning' || tone === 'destructive' ? 'alert' : 'status'}
      data-testid="alert-banner"
      data-slot="alert-banner"
      data-tone={tone}
      className={cn('flex items-start gap-2.5 rounded-md px-3 py-2.5', TONE_CLASS[tone], className)}
    >
      <Glyph size={15} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="type-caption font-semibold">{title}</p>
        {description ? (
          <p data-testid="alert-banner-description" className="type-caption mt-0.5 font-normal opacity-90">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
