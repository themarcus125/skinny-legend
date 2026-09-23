import type { LocalDate } from '../dates.js';
import type { ChallengeConfig } from '../scoring/types.js';

/** The four reminder kinds from spec §E — the planner's own. */
export type PlannerNotificationKind = 'inactive_1d' | 'inactive_3d' | 'inactive_7d' | 'rank_nudge';
export const NOTIFICATION_KINDS: readonly PlannerNotificationKind[] = [
  'inactive_1d',
  'inactive_3d',
  'inactive_7d',
  'rank_nudge',
] as const;

/** Sent from the social routes, never by the planner (feed social spec §C). */
export type SocialNotificationKind = 'heart' | 'comment';
export const SOCIAL_NOTIFICATION_KINDS: readonly SocialNotificationKind[] = ['heart', 'comment'] as const;

/** Mirrors the `notification_kind` pg enum. */
export type NotificationKind = PlannerNotificationKind | SocialNotificationKind;

/** Vietnamese is the source of truth; `en` is a full translation, not a fallback. */
export type NotificationLocale = 'vi' | 'en';

/** Substitutions for the copy in templates.ts. Which keys are set depends on the kind. */
export interface NotificationVars {
  /** inactive_*: the exact gap that triggered it (1, 3 or 7). */
  days?: number;
  /** rank_nudge: points behind the member at the next rank up. */
  gap?: number;
  /** rank_nudge / heart / comment: display name of that member, or the actor's. */
  name?: string;
  /** rank_nudge: points behind rank 1. Absent when the user is rank 2 (spec §E). */
  gapToTop?: number;
  /** comment: the first 80 characters of the body, whitespace collapsed, "…" when cut. */
  excerpt?: string;
}

/** One candidate for a reminder. `lastConfirmedDate` is null when the user never logged anything. */
export interface PlannerUser {
  userId: string;
  lastConfirmedDate: LocalDate | null;
  rank: number;
  total: number;
  locale: NotificationLocale;
}

/** A leaderboard row, as `loadScoreboard` produces it. Ties share a rank. */
export interface LeaderboardStanding {
  userId: string;
  displayName: string;
  rank: number;
  total: number;
}

/** A `notification_log` row, trimmed to what the dedupe rule needs. */
export interface NotificationLogEntry {
  userId: string;
  kind: NotificationKind;
  sentAt: Date;
}

export interface PlanInput {
  users: PlannerUser[];
  leaderboard: LeaderboardStanding[];
  /** Recent sends. Anything older than 24 h is ignored, so the caller may over-fetch. */
  log: NotificationLogEntry[];
  today: LocalDate;
  /** The instant the job runs. Needed because the 24 h dedupe window is not a calendar day. */
  now: Date;
  challenge: ChallengeConfig;
}

export interface Planned {
  userId: string;
  kind: NotificationKind;
  locale: NotificationLocale;
  title: string;
  body: string;
  /** Stored in `notification_log.payload_json` so the admin table can show what was sent. */
  vars: NotificationVars;
}
