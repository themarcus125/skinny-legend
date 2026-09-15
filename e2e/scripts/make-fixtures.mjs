#!/usr/bin/env node
// Builds the four photo fixtures. Three carry real EXIF — DateTimeOriginal plus GPS in Ho Chi
// Minh City — and one deliberately carries none, so the track spec can cover both paths.
// `piexifjs` writes EXIF into a JPEG's bytes; `sharp` produces the pixels.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import piexif from 'piexifjs';

const OUT = fileURLToPath(new URL('../fixtures/', import.meta.url));

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
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:09:15 07:30:00' },
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
console.log('wrote 4 fixtures to', OUT);
