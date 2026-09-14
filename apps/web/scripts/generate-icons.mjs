#!/usr/bin/env node
// Regenerates public/icons/* from the iOS app icon, so the home-screen icon on iPhone and the
// installed PWA icon are the same mark. Run with `pnpm --filter @skinny/web icons`; the PNGs are
// committed, so a normal build never needs sharp.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
const SOURCE = fileURLToPath(
  new URL('../../../ios/SkinnyLegend/Assets.xcassets/AppIcon.appiconset/AppIcon.png', import.meta.url),
);

/** Light `--background` from `@skinny/ui/styles/tokens.css` — the manifest's background_color. */
const BACKGROUND = { r: 0xed, g: 0xec, b: 0xf1, alpha: 1 };

/**
 * A maskable icon is cropped to whatever shape the launcher wants, so the mark has to sit inside
 * the 80% safe zone the spec defines — 10% padding on every side, on an opaque square.
 */
const MASKABLE_SAFE_ZONE = 0.8;

mkdirSync(OUT, { recursive: true });

async function square(size) {
  return sharp(SOURCE).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
}

async function maskable(size) {
  const inner = Math.round(size * MASKABLE_SAFE_ZONE);
  const offset = Math.round((size - inner) / 2);
  const mark = await sharp(SOURCE).resize(inner, inner, { fit: 'cover' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: mark, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const files = [
  ['icon-192.png', await square(192)],
  ['icon-512.png', await square(512)],
  ['icon-maskable-512.png', await maskable(512)],
  // iOS Safari never reads the manifest for the home-screen icon; it reads this link tag.
  ['apple-touch-icon.png', await square(180)],
];

for (const [name, buffer] of files) {
  writeFileSync(`${OUT}${name}`, buffer);
  console.log(`generate-icons: ${name} (${buffer.length} bytes)`);
}
