import type { LocalDate } from '../dates.js';

export const CATEGORIES = ['exercise', 'meal', 'group'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface ScoringRule {
  category: Category;
  points: number;
  capCount: number;
  capPeriod: 'day' | 'week';
}

export interface ConfirmedEntry {
  id: string;
  localDate: LocalDate;
  takenAt: Date;
  categories: Category[];
}

export interface ScoredCategory {
  entryId: string;
  category: Category;
  points: number;
  capped: boolean;
}

export interface ChallengeConfig {
  startDate: LocalDate;
  endDate: LocalDate;
  timezone: string;
  streakPoints: number;
  streakLength: number;
}

export interface StreakResult {
  current: number;
  longest: number;
  bonusesAwarded: number;
  bonusPoints: number;
}

export interface ScoreResult {
  total: number;
  byCategory: Record<Category, number>;
  streakBonus: number;
  byDay: Record<LocalDate, { points: number; categories: Category[] }>;
  scored: ScoredCategory[];
  streak: StreakResult;
  capsHit: Record<Category, boolean>;
}
