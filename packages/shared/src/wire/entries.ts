import { z } from 'zod';
import { categorySchema, placeSourceSchema, cursorSchema, type Category, type EntryStatus, type PlaceSource } from './primitives.js';

export const createEntryBody = z.object({
  photoKey: z.string().min(1),
  takenAt: cursorSchema,
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeName: z.string().max(120).optional(),
  placeSource: placeSourceSchema.optional(),
});
export type CreateEntryInput = z.infer<typeof createEntryBody>;

/** Strava's "Night Run" line: one short heading the member gives the entry. */
export const ENTRY_TITLE_MAX = 80;
/** Strava's "How'd it go?" box. */
export const ENTRY_NOTE_MAX = 500;

export const patchEntryBody = z.object({
  categories: z.array(categorySchema).min(1).max(3),
  placeName: z.string().max(120).nullable().optional(),
  placeSource: placeSourceSchema.optional(),
  /** Omitted leaves the stored value alone; null or '' clears it. */
  title: z.string().max(ENTRY_TITLE_MAX).nullable().optional(),
  note: z.string().max(ENTRY_NOTE_MAX).nullable().optional(),
});
export type PatchEntryInput = z.infer<typeof patchEntryBody>;

export const historyQuery = z.object({
  cursor: cursorSchema.optional(),
  /** Page size; the server's `HISTORY_PAGE_SIZE` when omitted. Ghi nhận asks for 5. */
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type HistoryQuery = z.infer<typeof historyQuery>;

export interface EntryDto {
  id: string;
  userId: string;
  photoUrl: string;
  thumbUrl: string | null;
  takenAt: string;
  localDate: string;
  status: EntryStatus;
  categories: Category[];
  placeName: string | null;
  placeSource: PlaceSource;
  /** The member's own heading and note, both null until typed on the verdict sheet. */
  title: string | null;
  note: string | null;
  createdAt: string;
}

export interface VerdictDto {
  categories: string[];
  healthy: boolean | null;
  confidence: number;
  reason: string;
  model: string;
  failed: boolean;
}

export interface ProjectionDto {
  projectedPoints: number;
  capsHit: Record<Category, boolean>;
  cappedCategories: Category[];
}

export interface EntryMutationResponse extends ProjectionDto {
  entry: EntryDto;
  verdict?: VerdictDto;
}

export interface HistoryEntryDto extends EntryDto {
  points?: number;
  capped?: boolean;
}

export interface HistoryResponse {
  entries: HistoryEntryDto[];
  nextCursor: string | null;
}
