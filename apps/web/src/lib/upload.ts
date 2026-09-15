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

/** JPEG quality for a converted photo — iOS's `ImagePipeline` compresses at the same 0.9. */
const JPEG_QUALITY = 0.9;

/** The longest edge a converted photo keeps, matching iOS's `ImagePipeline.maxDimension`. */
const MAX_DIMENSION = 2048;

export interface Uploadable {
  blob: Blob;
  contentType: UploadContentType;
}

/**
 * Decodes a photo and re-encodes it as JPEG through a canvas — the only conversion a browser
 * can do without a wasm decoder. Safari decodes HEIC natively (it is the format its own camera
 * writes), which is exactly the browser that produces them.
 */
async function canvasToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('canvas produced no blob');
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * The bytes and the content type to presign for, applying ruling R25.
 *
 * A JPEG, PNG or WebP goes up untouched — re-encoding it would only lose quality and strip the
 * EXIF block the caller has already read. Everything else (HEIC, an unlabelled file a browser
 * still decodes) is converted. A file nothing can decode fails as `photo_invalid`, the same
 * code the API would answer with, so the screen renders the catalog message it already has.
 */
export async function toUploadable(
  file: Blob,
  convert: (file: Blob) => Promise<Blob> = canvasToJpeg,
): Promise<Uploadable> {
  const type = file.type as UploadContentType;
  if (DIRECT_UPLOAD_TYPES.includes(type)) return { blob: file, contentType: type };
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

/** The entry-photo case, which is the one every Track call site wants. */
export function uploadPhoto(
  api: ApiClient,
  file: Blob,
  onProgress: (fraction: number) => void,
  convert?: (file: Blob) => Promise<Blob>,
): Promise<string> {
  return uploadWithProgress(api, 'photo', file, onProgress, convert);
}
