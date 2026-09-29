import { ApiError, type AdminApi } from '@/lib/api';
import type { AdminEntryInput, AdminEntryResult } from '@/lib/api/types';

/** The photo types a desktop browser can hand over and the API can decode. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];

const isPhotoType = (type: string): type is PhotoType => (PHOTO_TYPES as readonly string[]).includes(type);

/**
 * Adds an entry for a member. A photo goes to storage first — presign, then the PUT — and only
 * once it is there is the entry created with its key, so a failed upload leaves nothing behind
 * for the member to see.
 */
export async function saveNewEntry(api: AdminApi, input: AdminEntryInput, photo: File | null): Promise<AdminEntryResult> {
  if (!photo) return api.addEntry(input);
  if (!isPhotoType(photo.type)) throw new ApiError(0, 'photo_invalid', `Unsupported photo type: ${photo.type}`);
  const { key, url } = await api.presign({ kind: 'photo', contentType: photo.type });
  await api.uploadToPresign(url, photo, photo.type);
  return api.addEntry({ ...input, photoKey: key });
}

/** The catalog key and values for "what this entry now earns", shown after a save. */
export function earnedLabel(result: Pick<AdminEntryResult, 'points' | 'capped'>): {
  key: 'entries.earned' | 'entries.earnedCapped';
  values: { points: number };
} {
  return { key: result.capped ? 'entries.earnedCapped' : 'entries.earned', values: { points: result.points } };
}
