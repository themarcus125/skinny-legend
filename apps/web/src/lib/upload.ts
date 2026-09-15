import type { ApiClient, UploadContentType, UploadKind } from '@skinny/api-client';
import { ApiError } from './live-client';

/**
 * The content types `POST /uploads/presign` accepts (`UPLOAD_CONTENT_TYPES`) minus `image/heic`.
 *
 * Ruling R25: the API allows HEIC because iOS uploads it untouched, but R2 would then hold a
 * file no browser can render back in the feed. iOS Safari hands `<input type="file">` a HEIC
 * straight off the camera roll, so the web converts anything outside this set to JPEG before it
 * ever asks for a presigned URL.
 */
export const DIRECT_UPLOAD_TYPES: readonly UploadContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * The byte budget for an entry photo. A 12 MP camera JPEG is 3–6 MB; the feed, the map and the
 * vision model (which the API downsizes to 1200 px anyway) need nothing like that, and a member on
 * mobile data uploads several a day. WhatsApp lands its photos at a few hundred KB by the same two
 * moves — a ~1600 px long edge and a JPEG quality around 0.8 — so that is the target here.
 */
export const PHOTO_MAX_BYTES = 600 * 1024;

/** The longest edge an entry photo keeps. 1600 px is sharp on any phone and ~4× the API's 1200. */
export const PHOTO_MAX_DIMENSION = 1600;

/**
 * JPEG qualities tried in order until the photo fits `PHOTO_MAX_BYTES`. The first is the
 * WhatsApp-ish default; the rest only apply to a very noisy or very large photo. The last one is
 * accepted whatever its size, since a slightly heavy photo beats a refused one.
 */
export const PHOTO_QUALITY_LADDER: readonly number[] = [0.82, 0.72, 0.62, 0.5];

/**
 * The longest edge an avatar keeps — `ImagePipeline.prepareAvatar`'s. It is rendered at 96 px at
 * most (the profile sheet), so 512 covers a 3× display with room to spare and turns a 12 MP camera
 * photo into a few tens of KB.
 */
export const AVATAR_MAX_DIMENSION = 512;

/**
 * The largest source file the client will even try to decode. R2 and the API would take more, but
 * a browser decoding a 40 MP HEIC on a phone is a tab crash, and an avatar is never worth it. The
 * code is the API's own `photo_invalid`, so the screen renders the catalog message it already has.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface Uploadable {
  blob: Blob;
  contentType: UploadContentType;
}

/** Draws a decoded bitmap onto a canvas no larger than `maxDimension` and encodes it as JPEG. */
function encodeJpeg(bitmap: ImageBitmap, maxDimension: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas produced no blob'))), 'image/jpeg', quality),
  );
}

/**
 * Walks `ladder` until `encode` answers a blob within `maxBytes`, and settles for the last rung
 * otherwise. Pure so the ladder can be tested without a canvas.
 */
export async function encodeWithinBudget(
  encode: (quality: number) => Promise<Blob>,
  maxBytes: number,
  ladder: readonly number[] = PHOTO_QUALITY_LADDER,
): Promise<Blob> {
  let last: Blob | null = null;
  for (const quality of ladder) {
    last = await encode(quality);
    if (last.size <= maxBytes) return last;
  }
  if (!last) throw new Error('empty quality ladder');
  return last;
}

/**
 * Decodes a photo and re-encodes it as JPEG through a canvas — the only conversion a browser
 * can do without a wasm decoder. Safari decodes HEIC natively (it is the format its own camera
 * writes), which is exactly the browser that produces them. `createImageBitmap` applies the
 * EXIF orientation while decoding, so the output is upright and needs no orientation tag.
 *
 * The bitmap is decoded once and encoded as many times as the quality ladder needs: encoding is
 * cheap next to decoding a 12 MP HEIC on a phone.
 */
async function canvasToJpeg(file: Blob, maxDimension = PHOTO_MAX_DIMENSION, maxBytes = PHOTO_MAX_BYTES): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    return await encodeWithinBudget((quality) => encodeJpeg(bitmap, maxDimension, quality), maxBytes);
  } finally {
    bitmap.close();
  }
}

/**
 * The bytes and the content type to presign for, applying ruling R25 and the byte budget.
 *
 * A JPEG, PNG or WebP already within `PHOTO_MAX_BYTES` goes up untouched — re-encoding it would
 * only lose quality. Anything heavier is downscaled and re-encoded as JPEG, whatever its type: the
 * caller has already read the EXIF block it needs (Track reads capture time and GPS before it
 * uploads), so stripping it costs nothing. Everything outside the renderable set (HEIC, an
 * unlabelled file a browser still decodes) is converted regardless of size. A file nothing can
 * decode fails as `photo_invalid`, the same code the API would answer with, so the screen renders
 * the catalog message it already has.
 */
export async function toUploadable(
  file: Blob,
  convert: (file: Blob) => Promise<Blob> = canvasToJpeg,
): Promise<Uploadable> {
  const type = file.type as UploadContentType;
  if (DIRECT_UPLOAD_TYPES.includes(type) && file.size <= PHOTO_MAX_BYTES) return { blob: file, contentType: type };
  try {
    return { blob: await convert(file), contentType: 'image/jpeg' };
  } catch {
    throw new ApiError(0, 'photo_invalid', 'The photo could not be decoded');
  }
}

/**
 * Convert → presign → PUT, reporting a 0…1 fraction the whole way, and answering with the R2
 * key the caller's `POST`/`PATCH` needs. The PUT itself is `ApiClient.uploadToPresign` (an
 * `XMLHttpRequest`, the only browser API that reports upload progress), so mock mode resolves
 * it in memory instead of trying to reach `mock://upload/…`.
 *
 * `kind` is what the API scopes the key by — `photo` for an entry, `avatar` for the profile
 * picture (Task 12), `feedback` for a screenshot. Ruling R25's conversion applies to all three:
 * a HEIC avatar would be just as unreadable in the leaderboard as a HEIC entry photo.
 */
export async function uploadWithProgress(
  api: ApiClient,
  kind: UploadKind,
  file: Blob,
  onProgress: (fraction: number) => void,
  /** The R25 conversion seam — injected in tests, where jsdom has no canvas to decode with. */
  convert?: (file: Blob) => Promise<Blob>,
): Promise<string> {
  const { blob, contentType } = await toUploadable(file, convert);
  const presign = await api.presign({ kind, contentType });
  await api.uploadToPresign(presign.url, blob, contentType, onProgress);
  onProgress(1);
  return presign.key;
}

/**
 * The avatar case. Unlike a photo, an avatar is **always** re-encoded, whatever its type: the
 * source is a camera roll image that will be drawn in a 40–96 px circle, so the point of the
 * conversion is the 512 px downscale, not the format (ruling R25 only ever covered the format).
 * A source over `MAX_UPLOAD_BYTES` is refused before `presign` is even asked for a URL.
 */
export async function uploadAvatar(
  api: ApiClient,
  file: Blob,
  onProgress: (fraction: number) => void,
  /** The conversion seam — injected in tests, where jsdom has no canvas to decode with. */
  convert: (file: Blob) => Promise<Blob> = (source) => canvasToJpeg(source, AVATAR_MAX_DIMENSION, Infinity),
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(0, 'photo_invalid', 'The photo is too large to process');
  }
  let blob: Blob;
  try {
    blob = await convert(file);
  } catch {
    throw new ApiError(0, 'photo_invalid', 'The photo could not be decoded');
  }
  const presign = await api.presign({ kind: 'avatar', contentType: 'image/jpeg' });
  await api.uploadToPresign(presign.url, blob, 'image/jpeg', onProgress);
  onProgress(1);
  return presign.key;
}

/** The entry-photo case, which is the one every Track call site wants. */
export function uploadPhoto(
  api: ApiClient,
  file: Blob,
  onProgress: (fraction: number) => void,
  convert?: (file: Blob) => Promise<Blob>,
): Promise<string> {
  return uploadWithProgress(api, 'photo', file, onProgress, convert);
}
