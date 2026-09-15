#!/usr/bin/env node
// Builds the four photo fixtures. Three carry real EXIF — DateTimeOriginal plus GPS in Ho Chi
// Minh City — and one deliberately carries none, so the track spec can cover both paths.
// `piexifjs` writes EXIF into a JPEG's bytes; `sharp` produces the pixels.
//
// The fixtures are NOT committed: a fixed `DateTimeOriginal` becomes "yesterday" the next day and
// the dashboard's Today card — which the track spec asserts — goes empty. Global setup runs this
// script into the gitignored `e2e/.fixtures/` on every cold run, with the date it wants.
//
//   node scripts/make-fixtures.mjs [--out <dir>] [--date YYYY-MM-DD]
//
// `--date` defaults to today in Asia/Ho_Chi_Minh; the EXIF wall clock is 00:05 on that date, far
// enough from either midnight that no straddle can move it to an adjacent day.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import piexif from 'piexifjs';

const TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Today's calendar date in `TIMEZONE`, as `YYYY-MM-DD`. Mirrored by `fixtureDate()` in src/config.ts. */
function todayInTimezone(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function argOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const OUT = resolve(argOf('--out') ?? fileURLToPath(new URL('../.fixtures/', import.meta.url)));
const DATE = argOf('--date') ?? todayInTimezone();
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  throw new Error(`--date must be YYYY-MM-DD, got ${DATE}`);
}
/** EXIF's own format: `YYYY:MM:DD HH:MM:SS`, wall clock, no zone. */
const TAKEN_AT = `${DATE.replaceAll('-', ':')} 00:05:00`;
mkdirSync(OUT, { recursive: true });

/** Ho Chi Minh City, a few hundred metres apart so the map shows distinct pins. */
const SPOTS = {
  exercise: { lat: 10.7769, lon: 106.7009, rgb: { r: 34, g: 139, b: 34 } },
  meal: { lat: 10.7797, lon: 106.699, rgb: { r: 210, g: 105, b: 30 } },
  group: { lat: 10.773, lon: 106.704, rgb: { r: 70, g: 130, b: 180 } },
};

/** Decimal degrees → EXIF rational [[deg,1],[min,1],[sec,100]]. */
function toDms(value) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100);
  return [
    [deg, 1],
    [min, 1],
    [sec, 100],
  ];
}

async function jpeg(rgb) {
  return sharp({ create: { width: 900, height: 1200, channels: 3, background: rgb } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

for (const [name, spot] of Object.entries(SPOTS)) {
  const buffer = await jpeg(spot.rgb);
  const data = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  const exif = {
    '0th': { [piexif.ImageIFD.Make]: 'SkinnyLegend', [piexif.ImageIFD.Model]: 'E2E' },
    // piexifjs 1.0.6 has no tag table entry for OffsetTimeOriginal (0x9011) and throws on it,
    // so the timestamp is written bare — EXIF wall-clock time, read as Asia/Ho_Chi_Minh.
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: TAKEN_AT },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: toDms(spot.lat),
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: toDms(spot.lon),
    },
  };
  const withExif = piexif.insert(piexif.dump(exif), data);
  writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(withExif.split(',')[1], 'base64'));
}

// No EXIF at all: sharp's output carries none unless piexif puts some in.
writeFileSync(join(OUT, 'no-exif.jpg'), await jpeg({ r: 128, g: 128, b: 128 }));
console.log(`wrote 4 fixtures dated ${DATE} to ${OUT}`);
