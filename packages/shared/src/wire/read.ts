import { z } from 'zod';
import { cursorSchema, type Category } from './primitives.js';
import type { StreakResult } from '../scoring/types.js';
import type { EntryDto } from './entries.js';
import type { UserSummaryDto } from './me.js';

export const feedQuery = z.object({ cursor: cursorSchema.optional() });
export type FeedQuery = z.infer<typeof feedQuery>;

export const mapQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });
export type MapQuery = z.infer<typeof mapQuery>;

export interface DashboardDto {
  today: { points: number; categories: Category[] };
  yesterday: { points: number };
  deltaVsYesterday: number;
  /** Exactly what `computeScore` returns as `streak`. */
  streak: StreakResult;
  total: number;
  rank: number;
  memberCount: number;
  capsHit: Record<Category, boolean>;
  remaining: Category[];
}

export interface LeaderboardRowDto {
  rank: number;
  user: UserSummaryDto;
  total: number;
  weekPoints: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardRowDto[];
}

export interface TrendsResponse {
  weeks: { week: string; mine: number; groupAvg: number; rank: number }[];
  heatmap: { date: string; points: number }[];
  byCategory: Record<Category, number>;
  streakBonus: number;
}

export interface FeedEntryDto extends EntryDto {
  user: UserSummaryDto;
  heartCount: number;
  commentCount: number;
  /** Whether the requesting member has hearted this entry. */
  heartedByMe: boolean;
}

/** `PUT`/`DELETE /entries/:id/heart` — the truth after the call, for the client to settle on. */
export interface HeartResponse {
  heartCount: number;
  heartedByMe: boolean;
}

export interface CommentDto {
  id: string;
  entryId: string;
  user: UserSummaryDto;
  body: string;
  createdAt: string;
  /** Author or entry owner, decided server-side. */
  canDelete: boolean;
}

export interface CommentsResponse {
  comments: CommentDto[];
}

export interface PostCommentResponse {
  comment: CommentDto;
  commentCount: number;
}

export interface FeedResponse {
  entries: FeedEntryDto[];
  nextCursor: string | null;
}

export interface MapPinDto {
  entryId: string;
  lat: number;
  lng: number;
  placeName: string | null;
  takenAt: string;
  localDate: string;
  categories: Category[];
  thumbUrl: string | null;
  user: UserSummaryDto;
}

export interface MapResponse {
  pins: MapPinDto[];
}
