/**
 * DTOs mirroring the live API.
 *
 * Moved verbatim from `apps/admin/src/lib/api/types.ts` (task-2 ruling R4): every name the
 * admin console imports — `AdminUser`, `AdminEntry`, `MapPin`, `MePatch`, the label tuples —
 * still resolves, so no admin component changed. What used to be hand-copied literals
 * (`CATEGORIES`, `ROLES`, `USER_STATUSES`, `ENTRY_STATUSES`, `USER_LOCALES`, `PlaceSource`)
 * are now re-exports of the single definitions in `@skinny/shared/wire`; the values are
 * identical, which is the whole point of the move.
 *
 * Web-facing aliases (`UserDto`, `EntryDto`, `MapPinDto`, `AdminEntryDto`, …) are added
 * alongside the admin names rather than replacing them.
 *
 * Keep in sync with:
 *   apps/api/src/routes/admin.ts          (every /admin/* response)
 *   packages/shared/src/wire/*.ts         (everything else)
 */

export {
  CATEGORIES,
  ROLES,
  USER_STATUSES,
  ENTRY_STATUSES,
  USER_LOCALES,
  PLACE_SOURCES,
  DEVICE_PLATFORMS,
} from '@skinny/shared/wire';

export type {
  Category,
  Role,
  UserStatus,
  EntryStatus,
  UserLocale,
  PlaceSource,
  DevicePlatform,
  // Entries
  EntryDto,
  VerdictDto,
  ProjectionDto,
  EntryMutationResponse,
  HistoryEntryDto,
  HistoryResponse,
  CreateEntryInput,
  PatchEntryInput,
  // Me / devices
  UserDto,
  UserSummaryDto,
  DeviceDto,
  PatchMeInput,
  RegisterDeviceInput,
  // Read models
  DashboardDto,
  LeaderboardRowDto,
  LeaderboardResponse,
  TrendsResponse,
  FeedEntryDto,
  FeedResponse,
  MapPinDto,
  MapResponse,
  // Uploads
  PresignInput,
  PresignResponse,
  UploadKind,
  UploadContentType,
  // Places
  NearbyPlace,
  NearbyPlacesResponse,
} from '@skinny/shared/wire';

import type {
  Category,
  EntryDto,
  EntryStatus,
  MapPinDto,
  Role,
  UserDto,
  UserLocale,
  UserStatus,
} from '@skinny/shared/wire';

/** `GET /admin/users` rows and `POST /auth/session`: a raw `users` row. */
export type AdminUser = UserDto;

/** `GET /entries/map?days=` rows. The admin's historical name for `MapPinDto`. */
export type MapPin = MapPinDto;

export type CapPeriod = 'day' | 'week';

/**
 * The verdict as `GET /admin/entries` serialises it — nullable where the wire `VerdictDto`
 * is not, because an admin row can carry a half-written verdict from a failed vision call.
 */
export interface EntryVerdict {
  categories: string[];
  healthy: boolean | null;
  confidence: number | null;
  reason: string | null;
  model: string;
  failed: boolean;
}

/** A row of `GET /admin/entries`: the entry DTO plus joined user, coordinates and verdict. */
export interface AdminEntry extends EntryDto {
  user: { id: string; displayName: string };
  lat: number | null;
  lng: number | null;
  verdict: EntryVerdict | null;
}

/** Web-facing alias for `AdminEntry`. */
export type AdminEntryDto = AdminEntry;

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

/**
 * A `scoring_rules` row as `GET /admin/rules` returns it. Deliberately *not* the shared
 * `ScoringRule` from `@skinny/shared/scoring`, which is the id-less scoring input.
 */
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

/** Body of `POST /feedback`. */
export interface FeedbackInput {
  message: string;
  screenshotKey?: string;
  appVersion?: string;
}

/** Body of `PATCH /admin/users/:id`. At least one key is required by the API. */
export interface UserPatch {
  status?: UserStatus;
  role?: Role;
  displayName?: string;
}

/** Body of `PATCH /me` as sent by the console: only the language preference. */
export interface MePatch {
  locale: UserLocale;
}

/** Body of `PATCH /admin/entries/:id`. */
export interface EntryPatch {
  categories?: Category[];
  status?: EntryStatus;
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
