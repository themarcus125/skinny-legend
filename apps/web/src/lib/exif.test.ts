import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readExif } from './exif';

/**
 * The same fixture the Playwright spec uploads: a 96×96 JPEG carrying `DateTimeOriginal`
 * 2026:09:14 10:12:30 with `OffsetTimeOriginal` +07:00, and a GPS pair in Ho Chi Minh City.
 * Regenerate it with the snippet in `.superpowers/sdd/2026-09-14-web-pwa/task-8-report.md`.
 */
// `process.cwd()` is apps/web under vitest; `import.meta.url` is an http URL there.
const FIXTURE = readFileSync(resolve(process.cwd(), 'e2e/fixtures/entry.jpg'));

function fixtureFile(): File {
  return new File([new Uint8Array(FIXTURE)], 'entry.jpg', { type: 'image/jpeg' });
}

describe('readExif', () => {
  it('reads the capture instant and the GPS pair out of a real photo', async () => {
    const result = await readExif(fixtureFile());
    // 10:12:30 at +07:00 is 03:12:30Z — `exifr` applies the offset tag, so the ISO string is a
    // real instant rather than a wall clock the API would have to guess a zone for.
    expect(result.takenAt).toBe('2026-09-14T03:12:30.000Z');
    expect(result.lat).toBeCloseTo(10.7769, 4);
    expect(result.lng).toBeCloseTo(106.7009, 4);
  });

  it('answers "nothing known" for a photo with the EXIF block stripped', async () => {
    const stripped = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
    expect(await readExif(stripped)).toEqual({ takenAt: null, lat: null, lng: null });
  });

  it('never throws when the parser itself rejects the input', async () => {
    // A denial from `exifr` is not a reason to refuse the upload: `POST /entries` takes an
    // entry with no coordinates, and the caller falls back to `new Date()` for the time.
    expect(await readExif({} as unknown as Blob)).toEqual({ takenAt: null, lat: null, lng: null });
  });
});
