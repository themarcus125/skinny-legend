import exifr from 'exifr';

/**
 * What the Track flow needs out of a photo's metadata: when it was taken and where.
 *
 * iOS gets both from `PHAsset`/`ImagePipeline` (`TrackModel.prepare` → `PreparedPhoto`). A
 * browser only ever sees the bytes, so the same two facts have to come out of the EXIF block —
 * and out of `navigator.geolocation` when the block has been stripped (see `./geo`).
 */
export interface ExifResult {
  /** `DateTimeOriginal` as an ISO instant, or null when the photo carries no capture time. */
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
}

const EMPTY: ExifResult = { takenAt: null, lat: null, lng: null };

/**
 * Reads capture time and GPS out of a photo. Never throws: a stripped file, a format `exifr`
 * cannot parse and a screenshot all answer the same "nothing known" result, because none of
 * them is a reason to refuse the upload — `POST /entries` accepts an entry with no coordinates
 * and the caller falls back to `new Date()` for the time.
 *
 * `exifr` already resolves `OffsetTimeOriginal` when the camera wrote one, so the `Date` it
 * hands back is a real instant; `toISOString()` then satisfies the wire's
 * `z.string().datetime({ offset: true })` (a `Z` suffix is an offset).
 *
 * A coordinate pair is all-or-nothing: half a fix is not a location.
 */
export async function readExif(file: Blob): Promise<ExifResult> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = (await exifr.parse(file, { tiff: true, exif: true, gps: true })) as
      | Record<string, unknown>
      | undefined;
  } catch {
    return EMPTY;
  }
  if (!tags) return EMPTY;

  const taken = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
  const takenAt =
    taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null;

  const lat = typeof tags.latitude === 'number' ? tags.latitude : null;
  const lng = typeof tags.longitude === 'number' ? tags.longitude : null;
  const located = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  return { takenAt, lat: located ? lat : null, lng: located ? lng : null };
}
