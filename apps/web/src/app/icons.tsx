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
