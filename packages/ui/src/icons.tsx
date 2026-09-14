import type { SVGProps } from 'react';

/**
 * The handful of glyphs this package's own anatomy needs, inlined.
 *
 * `@skinny/ui` stays icon-library-free on purpose: the two apps pick their own (the admin already
 * ships lucide-react), and every component that shows a *caller's* mark takes it as a `ReactNode`
 * prop (`EmptyState.icon`). These are the marks the component owns — an alert's tone glyph, a
 * chip's category glyph, a row's affordance chevron — and they are all decorative, so each is
 * `aria-hidden`; the surrounding text carries the meaning.
 */
type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 14, children, ...props }: GlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** success — `checkmark.circle.fill` on iOS. */
export function CheckCircleGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </Glyph>
  );
}

/** info — `info.circle.fill`. */
export function InfoGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Glyph>
  );
}

/** warning — `exclamationmark.triangle.fill`. */
export function WarningGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Glyph>
  );
}

/** destructive — `exclamationmark.octagon.fill`. */
export function OctagonAlertGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </Glyph>
  );
}

/** exercise — the `figure.run` slot; an activity trace reads at 12px where a figure does not. */
export function ActivityGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M2 12h4l2.5-7 5 14L16 12h6" />
    </Glyph>
  );
}

/** meal — `leaf.fill`. */
export function LeafGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 20c0-8 5-13 16-14 1 10-4 15-12 15H4z" />
      <path d="M4 20c4-4 7-6 11-7.5" />
    </Glyph>
  );
}

/** group — `person.2.fill`. */
export function PeopleGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20c0-3.6 2.8-5.6 6.2-5.6s6.2 2 6.2 5.6" />
      <path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6" />
      <path d="M18 14.8c2.1.6 3.4 2.4 3.4 5.2" />
    </Glyph>
  );
}

/** The un-selected chip's mark — iOS swaps the category symbol for a bare `circle`. */
export function CircleGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8" />
    </Glyph>
  );
}

/** The leaderboard row's disclosure affordance. */
export function ChevronRightGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m9 5 7 7-7 7" />
    </Glyph>
  );
}
