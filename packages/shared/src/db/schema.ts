import { pgTable, pgEnum, uuid, text, timestamp, date, integer, boolean, doublePrecision, jsonb, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['member', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'disabled']);
export const categoryEnum = pgEnum('category', ['exercise', 'meal', 'group']);
export const capPeriodEnum = pgEnum('cap_period', ['day', 'week']);
export const entryStatusEnum = pgEnum('entry_status', ['pending', 'confirmed', 'rejected']);
export const categorySourceEnum = pgEnum('category_source', ['ai', 'user', 'admin']);
export const placeSourceEnum = pgEnum('place_source', ['poi', 'geocode', 'manual', 'none']);
/**
 * The user's UI language (spec §D). Deliberately NOT named `locale`: the push feature adds a
 * separate `device_locale` enum for `device_tokens.locale`, and the two must not collide.
 */
export const userLocaleEnum = pgEnum('user_locale', ['vi', 'en']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: text('firebase_uid').notNull(),
  displayName: text('display_name').notNull(),
  avatarKey: text('avatar_key'),
  role: roleEnum('role').notNull().default('member'),
  status: userStatusEnum('status').notNull().default('pending'),
  locale: userLocaleEnum('locale').notNull().default('vi'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_firebase_uid_idx').on(t.firebaseUid)]);

export const challenges = pgTable('challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  streakPoints: integer('streak_points').notNull().default(5),
  streakLength: integer('streak_length').notNull().default(7),
});

export const scoringRules = pgTable('scoring_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id),
  category: categoryEnum('category').notNull(),
  points: integer('points').notNull(),
  capCount: integer('cap_count').notNull(),
  capPeriod: capPeriodEnum('cap_period').notNull(),
}, (t) => [uniqueIndex('scoring_rules_challenge_category_idx').on(t.challengeId, t.category)]);

export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id),
  photoKey: text('photo_key').notNull(),
  thumbKey: text('thumb_key'),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
  localDate: date('local_date').notNull(),
  status: entryStatusEnum('status').notNull().default('pending'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  placeName: text('place_name'),
  placeSource: placeSourceEnum('place_source').notNull().default('none'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('entries_user_date_idx').on(t.userId, t.localDate), index('entries_status_created_idx').on(t.status, t.createdAt)]);

export const entryCategories = pgTable('entry_categories', {
  entryId: uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  category: categoryEnum('category').notNull(),
  source: categorySourceEnum('source').notNull(),
}, (t) => [primaryKey({ columns: [t.entryId, t.category] })]);

export const aiVerdicts = pgTable('ai_verdicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  categoriesJson: jsonb('categories_json').$type<string[]>().notNull(),
  healthy: boolean('healthy'),
  confidence: doublePrecision('confidence'),
  reason: text('reason'),
  rawResponse: text('raw_response'),
  latencyMs: integer('latency_ms'),
  failed: boolean('failed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  message: text('message').notNull(),
  screenshotKey: text('screenshot_key'),
  appVersion: text('app_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Push (spec §E). `device_locale` is deliberately NOT named `locale`: SKI-46 adds a
 * `users.locale` enum of its own and the two must not collide.
 */
export const deviceLocaleEnum = pgEnum('device_locale', ['vi', 'en']);
export const devicePlatformEnum = pgEnum('device_platform', ['ios']);
export const notificationKindEnum = pgEnum('notification_kind', ['inactive_1d', 'inactive_3d', 'inactive_7d', 'rank_nudge']);

export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  token: text('token').notNull(),
  platform: devicePlatformEnum('platform').notNull().default('ios'),
  locale: deviceLocaleEnum('locale').notNull().default('vi'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('device_tokens_token_idx').on(t.token), index('device_tokens_user_idx').on(t.userId)]);

/** One row per notification actually delivered. Drives the 24h dedupe rule and the admin table. */
export const notificationLog = pgTable('notification_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: notificationKindEnum('kind').notNull(),
  payloadJson: jsonb('payload_json')
    .$type<{ title: string; body: string; locale: 'vi' | 'en'; vars: Record<string, string | number> }>()
    .notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('notification_log_user_kind_sent_idx').on(t.userId, t.kind, t.sentAt)]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  diffJson: jsonb('diff_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
