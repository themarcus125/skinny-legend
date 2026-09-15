import type { SVGProps } from 'react';

/**
 * The five tab glyphs, drawn to the same 24×24 grid and 1.75px stroke as `@skinny/ui`'s
 * `icons.tsx` so the bar reads as one set. They are decorative: every control carries its own
 * label from the catalog, so each glyph is `aria-hidden`.
 */
type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
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

export function HouseGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 10.2 12 3.75l8.5 6.45V19a1.25 1.25 0 0 1-1.25 1.25h-14A1.25 1.25 0 0 1 3.5 19z" />
      <path d="M9.5 20.25v-6h5v6" />
    </Glyph>
  );
}

export function TrophyGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M7 4.5h10v4.25a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.75v1.5A3.25 3.25 0 0 0 8 10.75" />
      <path d="M17 6h2.25v1.5A3.25 3.25 0 0 1 16 10.75" />
      <path d="M12 13.75v3.5" />
      <path d="M8.5 19.5h7" />
    </Glyph>
  );
}

export function ChartGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 19.5h16" />
      <path d="M7 19.5V11" />
      <path d="M12 19.5V5.5" />
      <path d="M17 19.5v-5.5" />
    </Glyph>
  );
}

export function PersonGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="8.25" r="3.5" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
    </Glyph>
  );
}

export function CameraGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3.75 8.75h3l1.5-2.5h7.5l1.5 2.5h3v9.5a1 1 0 0 1-1 1H4.75a1 1 0 0 1-1-1z" />
      <circle cx="12" cy="13.5" r="3.25" />
    </Glyph>
  );
}

/**
 * The sign-in wordmark's flame (iOS uses the SF Symbol `flame.fill`) — filled rather than
 * stroked, because at 72px a hairline outline disappears against the video.
 */
export function FlameGlyph(props: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12.7 1.6c-.3-.5-1-.5-1.3 0-1 1.5-2.3 3.9-2.3 5.7 0 1 .3 1.7.6 2.2-.5.2-1 .1-1.5-.3-.6-.5-.9-1.3-.9-2.2 0-.6-.7-.9-1.1-.4C4.9 8.2 3.9 10.3 3.9 13c0 4.7 3.6 8.4 8.1 8.4s8.1-3.7 8.1-8.4c0-4.6-3.5-8.1-7.4-11.4zM12 19.2c-1.8 0-3.2-1.4-3.2-3.2 0-1.5 1-2.7 2-3.9.4-.5 1.1-.4 1.4.1.4.7 1 1.4 1.6 2.1.9 1 1.4 1.7 1.4 2.7-.1 1.7-1.5 3.2-3.2 3.2z" />
    </svg>
  );
}

/** The Google mark, as the monochrome circled `G` iOS draws with `g.circle.fill`. */
export function GoogleGlyph(props: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.3 15.2a5.2 5.2 0 1 1 3.5-9.05l-1.8 1.7a2.75 2.75 0 1 0 .85 3.02H12.3v-2.3h5c.05.3.08.6.08.93 0 3.2-2.15 5.7-5.08 5.7z" />
    </svg>
  );
}

/** The pending-approval mark (iOS: the SF Symbol `hourglass`). */
export function HourglassGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M7 3.75h10M7 20.25h10" />
      <path d="M8 3.75v3.1c0 1.2.5 2.3 1.4 3.1l2.6 2.05 2.6-2.05A4.2 4.2 0 0 0 16 6.85v-3.1" />
      <path d="M8 20.25v-3.1c0-1.2.5-2.3 1.4-3.1L12 12l2.6 2.05a4.2 4.2 0 0 1 1.4 3.1v3.1" />
    </Glyph>
  );
}

/** The disabled-account mark (iOS: the SF Symbol `lock.fill`). */
export function LockGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="4.75" y="10.25" width="14.5" height="9.5" rx="2" />
      <path d="M8.25 10.25V7.5a3.75 3.75 0 0 1 7.5 0v2.75" />
    </Glyph>
  );
}

/** The disclosure chevron on a card that pushes another screen (`chevron.right` on iOS). */
export function ChevronRightGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.25} {...props}>
      <path d="m9 5 7 7-7 7" />
    </Glyph>
  );
}

/** The tick inside a done checklist row's filled circle (`checkmark.circle.fill` on iOS). */
export function CheckGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.75} {...props}>
      <path d="m6.5 12.5 3.6 3.6L17.5 8.5" />
    </Glyph>
  );
}

/** The delta's direction, so the sign is not carried by colour alone (`arrow.up.right` on iOS). */
export function ArrowUpRightGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.25} {...props}>
      <path d="M7.5 16.5 16.5 7.5" />
      <path d="M9 7.5h7.5V15" />
    </Glyph>
  );
}

export function ArrowDownRightGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.25} {...props}>
      <path d="M7.5 7.5 16.5 16.5" />
      <path d="M16.5 9v7.5H9" />
    </Glyph>
  );
}

/** The flat delta (`equal` on iOS). */
export function EqualGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.25} {...props}>
      <path d="M6.5 9.75h11" />
      <path d="M6.5 14.25h11" />
    </Glyph>
  );
}

/** The place chip's marker (`mappin.circle.fill` on iOS, drawn as an outline here). */
export function MapPinGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M19 10.5c0 5.25-7 11-7 11s-7-5.75-7-11a7 7 0 1 1 14 0z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </Glyph>
  );
}

/** The AI verdict card's mark (`sparkles` on iOS). */
export function SparklesGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m12 3.5 1.85 4.65L18.5 10l-4.65 1.85L12 16.5l-1.85-4.65L5.5 10l4.65-1.85z" />
      <path d="M18 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Glyph>
  );
}

/** A verdict the vision model could not read (`questionmark.circle.fill` on iOS). */
export function QuestionGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M9.75 9.5a2.25 2.25 0 1 1 2.75 2.2v1.55" />
      <path d="M12.5 16.4h.01" />
    </Glyph>
  );
}

/** Dismisses the photo or the sheet (`xmark` on iOS). */
export function CloseGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.25} {...props}>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </Glyph>
  );
}

/** The library button's mark (`photo.on.rectangle` on iOS). */
export function PhotoStackGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3.25" y="6.75" width="14" height="11" rx="2" />
      <path d="M6.75 17.75 11 13l3 3 2-2 3.5 3.5" />
      <path d="M7.75 6.75V5.5a1.75 1.75 0 0 1 1.75-1.75h9.25A1.75 1.75 0 0 1 20.5 5.5v9.25" />
    </Glyph>
  );
}
