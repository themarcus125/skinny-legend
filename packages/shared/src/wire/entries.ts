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

export const patchEntryBody = z.object({
  categories: z.array(categorySchema).min(1).max(3),
  placeName: z.string().max(120).nullable().optional(),
  placeSource: placeSourceSchema.optional(),
});
export type PatchEntryInput = z.infer<typeof patchEntryBody>;

export const historyQuery = z.object({ cursor: cursorSchema.optional() });
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
