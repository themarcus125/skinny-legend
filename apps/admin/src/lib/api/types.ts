/**
 * DTOs mirroring the live API. Keep in sync with:
 *   apps/api/src/routes/admin.ts          (every /admin/* response)
 *   apps/api/src/routes/entries.ts        (toEntryDto)
 *   apps/api/src/routes/auth.ts           (POST /auth/session)
 *   packages/shared/src/db/schema.ts      (pgEnum values)
 * The admin deliberately does not import @skinny/shared: that package resolves from
 * dist/, which would drag a cross-package build into the Vercel build.
 */

export const CATEGORIES = ['exercise', 'meal', 'group'] as const;
export type Category = (typeof CATEGORIES)[number];

export const ROLES = ['member', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['pending', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ENTRY_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export type CapPeriod = 'day' | 'week';
export type PlaceSource = 'poi' | 'geocode' | 'manual' | 'none';

/** `GET /admin/users` rows and `POST /auth/session`: a raw `users` row. */
export interface AdminUser {
  id: string;
  firebaseUid: string;
  displayName: string;
  avatarKey: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface EntryVerdict {
  categories: string[];
  healthy: boolean | null;
  confidence: number | null;
  reason: string | null;
  model: string;
  failed: boolean;
}

/** `toEntryDto` in apps/api/src/routes/entries.ts. */
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

/** A row of `GET /admin/entries`: the entry DTO plus joined user, coordinates and verdict. */
export interface AdminEntry extends EntryDto {
  user: { id: string; displayName: string };
  lat: number | null;
  lng: number | null;
  verdict: EntryVerdict | null;
}

/** Query string of `GET /admin/entries`. Absent keys are omitted from the URL. */
export interface EntryFilters {
  user?: string;
  status?: EntryStatus;
  from?: string;
  to?: string;
}

export interface Challenge {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  streakPoints: number;
  streakLength: number;
}

export interface ScoringRule {
  id: string;
  challengeId: string;
  category: Category;
  points: number;
  capCount: number;
  capPeriod: CapPeriod;
}

/** `GET /admin/rules`. */
export interface RulesResponse {
  challenge: Challenge;
  rules: ScoringRule[];
}

/** Body of `PUT /admin/rules`. `timezone` is not editable through the API. */
export interface RulesPayload {
  challenge: {
    startDate: string;
    endDate: string;
    streakPoints: number;
    streakLength: number;
  };
  rules: Array<{
    category: Category;
    points: number;
    capCount: number;
    capPeriod: CapPeriod;
  }>;
}

/** A row of `GET /admin/feedback`. */
export interface FeedbackItem {
  id: string;
  userId: string;
  message: string;
  screenshotKey: string | null;
  appVersion: string | null;
  createdAt: string;
  screenshotUrl: string | null;
  user: { id: string; displayName: string };
}

/** Body of `PATCH /admin/users/:id`. At least one key is required by the API. */
export interface UserPatch {
  status?: UserStatus;
  role?: Role;
  displayName?: string;
}

/** Body of `PATCH /admin/entries/:id`. */
export interface EntryPatch {
  categories?: Category[];
  status?: EntryStatus;
}

/** A row of `GET /entries/map?days=`. */
export interface MapPin {
  entryId: string;
  lat: number;
  lng: number;
  placeName: string | null;
  takenAt: string;
  localDate: string;
  categories: Category[];
  thumbUrl: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

/** Mirrors `notification_kind` in packages/shared/src/db/schema.ts. */
export const NOTIFICATION_KINDS = ['inactive_1d', 'inactive_3d', 'inactive_7d', 'rank_nudge'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** `notification_log.payload_json`, written by apps/api/src/jobs/notify.ts. */
export interface NotificationPayload {
  title: string;
  body: string;
  locale: 'vi' | 'en';
  vars: Record<string, string | number>;
}

/** A row of `GET /admin/notifications`. */
export interface NotificationLogItem {
  id: string;
  kind: NotificationKind;
  payload: NotificationPayload;
  sentAt: string;
  user: { id: string; displayName: string };
}

/** `POST /admin/notifications/test`. */
export interface TestSendResult {
  sent: number;
  tokens: number;
  removedTokens: number;
}
