# Feed Social (edit, hearts, comments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member edit their own activity from the group feed, heart any activity, and read/write comments on it, with a push to the entry's owner for hearts and comments.

**Architecture:** Two new tables (`entry_hearts`, `entry_comments`) and five routes in a new `apps/api/src/routes/social.ts`; `GET /feed` folds counts in with three grouped queries per page. Pushes go out from the route through the existing `PushSender` with a ten-minute per-entry dedupe against `notification_log`. On the web, `FeedRow` gains an action row (optimistic heart, comment sheet, "Sửa" that opens the existing verdict sheet through a hook lifted out of the history screen).

**Tech Stack:** Hono + drizzle-orm (postgres) on the API, zod wire schemas in `@skinny/shared`, React 19 + TanStack Query + use-intl on the web, vitest everywhere. pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-22-feed-social-design.md`

## Global Constraints

- Web + API only. iOS files are not touched. Every wire change is additive.
- Comment body: trimmed, 1–500 characters (`ENTRY_COMMENT_MAX = 500`). Whitespace-only is `400 invalid_body`.
- Every social route requires the entry to exist **and** be `confirmed`; otherwise `404 not_found`.
- Heart PUT/DELETE are idempotent and answer `200 { heartCount, heartedByMe }`.
- Push: recipient is the entry owner; never when the actor is the owner; skip when `notification_log` has `(recipient, kind, entry_id)` within the last 10 minutes; log only when at least one device accepted.
- Push payload `data`: `{ deepLink: 'feed', kind, entryId }`.
- Vietnamese is the source of truth for copy. New web strings go in `apps/web/messages/vi.json` **and** `apps/web/messages/web-only.json`; `en.json` is generated (`node scripts/seed-messages.mjs` in `apps/web`). Never edit `en.json` by hand. No Vietnamese literals in `apps/web/src` outside tests (`pnpm lint` enforces it).
- Before running API tests: `pnpm --filter @skinny/shared build`, Postgres up (`pnpm db:up` from the root), and the migration applied locally (`pnpm --filter @skinny/api db:migrate`).
- Commit after every task with a conventional message (`feat(api): …`, `feat(web): …`, `test(...)`, `refactor(web): …`).

---

## File map

**Create**
- `apps/api/drizzle/0005_feed_social.sql` (+ `meta/0005_snapshot.json`, generated)
- `apps/api/src/services/social-push.ts` — `notifyEntryOwner` (dedupe + send + log)
- `apps/api/src/routes/social.ts` — the five routes
- `apps/api/test/social-push.test.ts`, `apps/api/test/social.test.ts`
- `apps/web/src/features/feed/feed-model.ts` (+ `.test.ts`) — pure cache patches
- `apps/web/src/features/feed/comment-sheet.tsx` (+ `.test.tsx`)
- `apps/web/src/features/track/use-entry-editor.tsx` — the shared edit controller
- `apps/web/src/lib/relative-time.ts` (+ `.test.ts`)

**Modify**
- `packages/shared/src/db/schema.ts` — tables, enum values, `notification_log.entry_id`
- `packages/shared/src/wire/entries.ts` — `ENTRY_COMMENT_MAX`, `commentBody`
- `packages/shared/src/wire/read.ts` — `CommentDto`, `FeedEntryDto` fields, response types
- `packages/shared/src/notifications/types.ts`, `templates.ts` (+ `packages/shared/test/notification-templates.test.ts`)
- `apps/api/src/services/push.ts` — `sendInBatches` moves here from `jobs/notify.ts`
- `apps/api/src/app.ts` — mount + deps
- `apps/api/src/routes/read.ts` — feed aggregation
- `apps/api/test/helpers.ts` — `resetDb` clears the new tables
- `packages/api-client/src/types.ts`, `client.ts`, `mock/client.ts`, `mock/seed.ts`, `mock/admin-seed.ts`
- `apps/web/src/lib/query.ts`, `apps/web/src/app/icons.tsx`
- `apps/web/src/features/feed/feed.tsx` (+ `feed.test.tsx`)
- `apps/web/src/features/account/history.tsx`
- `apps/web/src/screens/overview.tsx`
- `apps/web/messages/vi.json`, `web-only.json`
- `apps/admin/messages/vi.json`, `en.json` (two kind labels)

---

### Task 1: Schema, migration and wire types

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Modify: `packages/shared/src/wire/entries.ts`
- Modify: `packages/shared/src/wire/read.ts`
- Modify: `packages/shared/src/notifications/types.ts`
- Modify: `apps/api/test/helpers.ts`
- Create: `apps/api/drizzle/0005_feed_social.sql` (generated)
- Test: `packages/shared/test/wire.test.ts`

**Interfaces:**
- Produces: `schema.entryHearts`, `schema.entryComments`, `schema.notificationLog.entryId`; `commentBody` zod schema and `ENTRY_COMMENT_MAX`; `CommentDto`, `HeartResponse`, `CommentsResponse`, `PostCommentResponse`; `FeedEntryDto` with `heartCount`, `commentCount`, `heartedByMe`; `SOCIAL_NOTIFICATION_KINDS`, `NotificationKind` widened, `NotificationVars.excerpt`.

- [ ] **Step 1: Write the failing wire test**

Append to `packages/shared/test/wire.test.ts`:

```ts
import { commentBody, ENTRY_COMMENT_MAX } from '../src/wire/entries.js';

describe('commentBody', () => {
  it('trims and accepts 1..500 characters', () => {
    expect(commentBody.parse({ body: '  Giỏi quá!  ' })).toEqual({ body: 'Giỏi quá!' });
    expect(commentBody.safeParse({ body: '   ' }).success).toBe(false);
    expect(commentBody.safeParse({ body: 'x'.repeat(ENTRY_COMMENT_MAX) }).success).toBe(true);
    expect(commentBody.safeParse({ body: 'x'.repeat(ENTRY_COMMENT_MAX + 1) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @skinny/shared test -- wire`
Expected: FAIL, `commentBody` is not exported.

- [ ] **Step 3: Add the wire types**

In `packages/shared/src/wire/entries.ts`, after `ENTRY_NOTE_MAX`:

```ts
/** A comment on a feed entry; whitespace-only is refused by `.min(1)` after the trim. */
export const ENTRY_COMMENT_MAX = 500;
export const commentBody = z.object({ body: z.string().trim().min(1).max(ENTRY_COMMENT_MAX) });
export type CommentInput = z.infer<typeof commentBody>;
```

In `packages/shared/src/wire/read.ts`, replace the `FeedEntryDto` interface and add the social DTOs after it:

```ts
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
```

In `packages/shared/src/notifications/types.ts`, replace the kind block and add `excerpt`:

```ts
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
```

and in `NotificationVars` add:

```ts
  /** heart / comment: the actor's display name. */
  name?: string;
  /** comment: the first 80 characters of the body, whitespace collapsed, "…" when cut. */
  excerpt?: string;
```

(`name` already exists for `rank_nudge`; only extend its doc comment, do not declare it twice.)

- [ ] **Step 4: Add the tables and the enum values**

In `packages/shared/src/db/schema.ts`, change the kind enum:

```ts
export const notificationKindEnum = pgEnum('notification_kind', ['inactive_1d', 'inactive_3d', 'inactive_7d', 'rank_nudge', 'heart', 'comment']);
```

(Find the existing declaration — it is the one enum not shown in the file header — and add the two values at the end.)

After `entryCategories`, add:

```ts
/** One row per member who hearted an entry; the primary key is what makes a heart idempotent. */
export const entryHearts = pgTable('entry_hearts', {
  entryId: uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.entryId, t.userId] })]);

export const entryComments = pgTable('entry_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('entry_comments_entry_created_idx').on(t.entryId, t.createdAt)]);
```

In `notificationLog`, after `kind`:

```ts
  /** The entry a heart/comment push is about; null for the planner's reminders. */
  entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'set null' }),
```

- [ ] **Step 5: Generate the migration and clear the tables in tests**

```bash
pnpm --filter @skinny/shared build
cd apps/api && pnpm exec drizzle-kit generate --name feed_social && cd ../..
```

Expected: `apps/api/drizzle/0005_feed_social.sql` containing two `ALTER TYPE … ADD VALUE`, two `CREATE TABLE`, one `ALTER TABLE "notification_log" ADD COLUMN "entry_id"`, plus foreign keys. Open it and check nothing else is in it.

In `apps/api/test/helpers.ts`, `resetDb`, add these two lines **before** `await db.delete(schema.entries);` (they reference entries) and after `notificationLog`:

```ts
  await db.delete(schema.entryComments);
  await db.delete(schema.entryHearts);
```

Apply locally: `pnpm --filter @skinny/api db:migrate`.

- [ ] **Step 6: Run the shared tests and the typechecks**

Run: `pnpm --filter @skinny/shared test && pnpm --filter @skinny/api typecheck && pnpm --filter @skinny/api-client typecheck && pnpm --filter @skinny/web typecheck && pnpm --filter @skinny/admin typecheck`
Expected: shared PASS. `api-client`, `web` and `admin` typechecks **fail** on `FeedEntryDto` literals missing the three new fields (mock `feed()`, `feed.test.tsx`) and on `NotificationKind` narrowing — those are fixed in Tasks 7 and 13. `api` typecheck fails on `read.ts` feed literal — fixed in Task 6. Record the failures; do not fix them here.

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/api/drizzle apps/api/test/helpers.ts
git commit -m "feat(shared): entry_hearts and entry_comments tables, social wire types, social notification kinds"
```

---

### Task 2: Notification templates for heart and comment

**Files:**
- Modify: `packages/shared/src/notifications/templates.ts`
- Test: `packages/shared/test/notification-templates.test.ts`

**Interfaces:**
- Produces: `renderNotification('heart' | 'comment', locale, { name, excerpt })`; `commentExcerpt(body: string): string`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/test/notification-templates.test.ts`:

```ts
import { commentExcerpt } from '../src/notifications/templates.js';

describe('social templates', () => {
  it('renders a heart in both languages with the actor name', () => {
    expect(renderNotification('heart', 'vi', { name: 'Linh' })).toEqual({
      title: 'Linh đã thả tim',
      body: 'Linh thích hoạt động của bạn.',
    });
    expect(renderNotification('heart', 'en', { name: 'Linh' })).toEqual({
      title: 'Linh sent a heart',
      body: 'Linh liked your activity.',
    });
  });

  it('renders a comment with the quoted excerpt', () => {
    expect(renderNotification('comment', 'vi', { name: 'Linh', excerpt: 'Giỏi quá' })).toEqual({
      title: 'Linh đã bình luận',
      body: '“Giỏi quá”',
    });
    expect(renderNotification('comment', 'en', { name: 'Linh', excerpt: 'Nice' }).title).toBe('Linh commented');
  });

  it('commentExcerpt collapses whitespace and cuts at 80 characters with an ellipsis', () => {
    expect(commentExcerpt('  hai \n dòng  ')).toBe('hai dòng');
    const long = 'a'.repeat(100);
    expect(commentExcerpt(long)).toBe('a'.repeat(80) + '…');
    expect(commentExcerpt('a'.repeat(80))).toBe('a'.repeat(80));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/shared test -- notification-templates`
Expected: FAIL — `commentExcerpt` missing and `TEMPLATES` has no `heart`/`comment` entry (TypeScript error on the `Record<NotificationKind, Template>`).

- [ ] **Step 3: Add the templates and the excerpt helper**

In `templates.ts`, add to `VI` after `rank_nudge`:

```ts
  heart: (v) => ({
    title: `${v.name ?? ''} đã thả tim`.trim(),
    body: `${v.name ?? ''} thích hoạt động của bạn.`.trim(),
  }),
  comment: (v) => ({
    title: `${v.name ?? ''} đã bình luận`.trim(),
    body: `“${v.excerpt ?? ''}”`,
  }),
```

and to `EN`:

```ts
  heart: (v) => ({
    title: `${v.name ?? ''} sent a heart`.trim(),
    body: `${v.name ?? ''} liked your activity.`.trim(),
  }),
  comment: (v) => ({
    title: `${v.name ?? ''} commented`.trim(),
    body: `“${v.excerpt ?? ''}”`,
  }),
```

After `TEST_NOTIFICATION`, add:

```ts
/** What a comment push shows of the body: whitespace collapsed, at most 80 characters plus "…". */
export const COMMENT_EXCERPT_MAX = 80;
export function commentExcerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length > COMMENT_EXCERPT_MAX ? `${collapsed.slice(0, COMMENT_EXCERPT_MAX)}…` : collapsed;
}
```

- [ ] **Step 4: Run the shared suite**

Run: `pnpm --filter @skinny/shared test`
Expected: PASS. If the existing "renders every kind in every locale" test iterates `NOTIFICATION_KINDS`, it still passes (that list is the planner's four).

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): heart and comment push templates with a comment excerpt"
```

---

### Task 3: `notifyEntryOwner` — dedupe, send, log

**Files:**
- Modify: `apps/api/src/services/push.ts` (receives `sendInBatches` + `chunk` from `jobs/notify.ts`)
- Modify: `apps/api/src/jobs/notify.ts` (imports `sendInBatches` instead of defining it)
- Create: `apps/api/src/services/social-push.ts`
- Test: `apps/api/test/social-push.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SocialPushDeps { sender?: PushSender; now?: () => Date }
  export const SOCIAL_DEDUPE_MS = 10 * 60 * 1000;
  export async function notifyEntryOwner(
    input: { entry: { id: string; userId: string }; actor: { id: string; displayName: string }; kind: 'heart' | 'comment'; excerpt?: string },
    deps?: SocialPushDeps,
  ): Promise<{ sent: number; skipped: 'self' | 'deduped' | 'no_devices' | null }>
  ```
- Consumes: `renderNotification`, `commentExcerpt` (Task 2), `schema.notificationLog.entryId` (Task 1).

- [ ] **Step 1: Move `sendInBatches` to `services/push.ts`**

Cut `SEND_BATCH_MAX`, `chunk` and `sendInBatches` (with their doc comments) out of `apps/api/src/jobs/notify.ts` and paste them at the bottom of `apps/api/src/services/push.ts`, exporting `sendInBatches`. In `notify.ts`, add `sendInBatches` to the existing import from `'../services/push.js'` and remove the now-unused `PushResult` import if TypeScript flags it.

Run: `pnpm --filter @skinny/api typecheck` — expected: only the `read.ts` feed literal error from Task 1 remains. Run `pnpm --filter @skinny/api test -- notify` — expected PASS (no behaviour changed).

- [ ] **Step 2: Write the failing tests**

Create `apps/api/test/social-push.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { fakeSender } from '../src/services/push.js';
import { notifyEntryOwner, SOCIAL_DEDUPE_MS } from '../src/services/social-push.js';
import { resetDb, asUser, challengeId } from './helpers.js';

const NOW = new Date('2026-09-22T10:00:00Z');

async function confirmedEntry(userId: string) {
  const [row] = await db.insert(schema.entries).values({
    userId, challengeId: await challengeId(), photoKey: `photos/${userId}/x.jpg`,
    takenAt: NOW, localDate: '2026-09-22', status: 'confirmed',
  }).returning();
  return row!;
}

beforeEach(resetDb);

describe('notifyEntryOwner', () => {
  it('sends one message per device of the owner, in their locale, and logs the entry', async () => {
    const owner = (await asUser('owner', { activate: true, name: 'Khoa' })).user;
    const actor = (await asUser('actor', { activate: true, name: 'Linh' })).user;
    await db.insert(schema.deviceTokens).values([
      { userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' },
      { userId: owner.id, token: 't2', platform: 'web', locale: 'vi' },
    ]);
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();

    const result = await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW });

    expect(result).toEqual({ sent: 2, skipped: null });
    expect(sender.sent.map((m) => m.token).sort()).toEqual(['t1', 't2']);
    expect(sender.sent[0]).toMatchObject({
      title: 'Linh đã thả tim',
      data: { deepLink: 'feed', kind: 'heart', entryId: entry.id },
    });
    const log = await db.select().from(schema.notificationLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ userId: owner.id, kind: 'heart', entryId: entry.id, sentAt: NOW });
  });

  it('is silent when the actor owns the entry', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();
    expect(await notifyEntryOwner({ entry, actor: owner, kind: 'heart' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: 'self' });
    expect(sender.sent).toHaveLength(0);
  });

  it('dedupes the same kind on the same entry within ten minutes, and sends again after', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true, name: 'Linh' })).user;
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();

    await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW });
    const soon = new Date(NOW.getTime() + 5 * 60 * 1000);
    expect(await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => soon })).toEqual({ sent: 0, skipped: 'deduped' });
    // A different kind on the same entry is not deduped against the heart.
    expect((await notifyEntryOwner({ entry, actor, kind: 'comment', excerpt: 'Hay' }, { sender, now: () => soon })).sent).toBe(1);
    const later = new Date(NOW.getTime() + SOCIAL_DEDUPE_MS + 1000);
    expect((await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => later })).sent).toBe(1);
    expect(sender.sent).toHaveLength(3);
  });

  it('reports no_devices and logs nothing when the owner has no token', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true })).user;
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();
    expect(await notifyEntryOwner({ entry, actor, kind: 'comment', excerpt: 'x' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: 'no_devices' });
    expect(await db.select().from(schema.notificationLog)).toHaveLength(0);
  });

  it('does not log when every device failed, so the next attempt is not deduped away', async () => {
    const owner = (await asUser('owner', { activate: true })).user;
    const actor = (await asUser('actor', { activate: true })).user;
    await db.insert(schema.deviceTokens).values({ userId: owner.id, token: 'dead', platform: 'ios', locale: 'vi' });
    const entry = await confirmedEntry(owner.id);
    const sender = fakeSender();
    sender.failures.set('dead', { unregistered: false, error: 'boom' });
    expect(await notifyEntryOwner({ entry, actor, kind: 'heart' }, { sender, now: () => NOW })).toEqual({ sent: 0, skipped: null });
    expect(await db.select().from(schema.notificationLog)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm --filter @skinny/api test -- social-push`
Expected: FAIL — module `../src/services/social-push.js` not found.

- [ ] **Step 4: Implement `social-push.ts`**

```ts
import { and, eq, gte } from 'drizzle-orm';
import { renderNotification, schema, type SocialNotificationKind } from '@skinny/shared';
import { db } from '../db.js';
import { pushSender, sendInBatches, type PushMessage, type PushSender } from './push.js';

export interface SocialPushDeps {
  sender?: PushSender;
  /** Injected clock: the dedupe window and the log row must agree in tests. */
  now?: () => Date;
}

/** One push per recipient per entry per kind in this window (feed social spec §C). */
export const SOCIAL_DEDUPE_MS = 10 * 60 * 1000;

export interface SocialPushInput {
  entry: { id: string; userId: string };
  actor: { id: string; displayName: string };
  kind: SocialNotificationKind;
  /** Comment only: already passed through `commentExcerpt`. */
  excerpt?: string;
}

export interface SocialPushResult {
  sent: number;
  skipped: 'self' | 'deduped' | 'no_devices' | null;
}

/**
 * Tells an entry's owner that someone hearted or commented. Never throws: a push is a courtesy
 * on top of a write that has already committed, so a sender outage is logged and swallowed by
 * `sendInBatches`, and the route answers as if nothing happened.
 */
export async function notifyEntryOwner(input: SocialPushInput, deps: SocialPushDeps = {}): Promise<SocialPushResult> {
  const sender = deps.sender ?? pushSender;
  const now = deps.now?.() ?? new Date();
  if (input.actor.id === input.entry.userId) return { sent: 0, skipped: 'self' };

  const [recent] = await db.select({ id: schema.notificationLog.id }).from(schema.notificationLog).where(and(
    eq(schema.notificationLog.userId, input.entry.userId),
    eq(schema.notificationLog.kind, input.kind),
    eq(schema.notificationLog.entryId, input.entry.id),
    gte(schema.notificationLog.sentAt, new Date(now.getTime() - SOCIAL_DEDUPE_MS)),
  )).limit(1);
  if (recent) return { sent: 0, skipped: 'deduped' };

  const devices = await db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.userId, input.entry.userId));
  if (devices.length === 0) return { sent: 0, skipped: 'no_devices' };

  const [owner] = await db.select({ locale: schema.users.locale }).from(schema.users).where(eq(schema.users.id, input.entry.userId));
  const vars = { name: input.actor.displayName, ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}) };
  const { title, body } = renderNotification(input.kind, owner?.locale ?? 'vi', vars);
  const messages: PushMessage[] = devices.map((d) => ({
    token: d.token,
    title,
    body,
    data: { deepLink: 'feed', kind: input.kind, entryId: input.entry.id },
    platform: d.platform,
  }));

  const results = await sendInBatches(sender, input.entry.userId, messages);
  const sent = results.filter((r) => r.ok).length;
  if (sent > 0) {
    await db.insert(schema.notificationLog).values({
      userId: input.entry.userId,
      kind: input.kind,
      entryId: input.entry.id,
      payloadJson: { title, body, locale: owner?.locale ?? 'vi', vars },
      sentAt: now,
    });
  }
  return { sent, skipped: null };
}
```

Dead tokens: the nightly job deletes `unregistered` tokens; this helper leaves that to the job (YAGNI, and the job runs daily).

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @skinny/api test -- social-push notify`
Expected: PASS for both files.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/push.ts apps/api/src/services/social-push.ts apps/api/src/jobs/notify.ts apps/api/test/social-push.test.ts
git commit -m "feat(api): notifyEntryOwner — heart/comment push with a ten-minute per-entry dedupe"
```

---

### Task 4: Heart routes

**Files:**
- Create: `apps/api/src/routes/social.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `socialRoutes(deps: SocialPushDeps)` mounted at `/`; `PUT /entries/:id/heart`, `DELETE /entries/:id/heart` → `HeartResponse`. `createApp` accepts `Partial<EntryDeps & PlaceDeps & SocialPushDeps>`.
- Consumes: `notifyEntryOwner` (Task 3), `schema.entryHearts` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/social.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { fakeSender } from '../src/services/push.js';
import { resetDb, asUser, challengeId } from './helpers.js';

const NOW = new Date('2026-09-22T10:00:00Z');
let clock = NOW;
const sender = fakeSender();
const app = createApp({ sender, now: () => clock });

const json = (headers: Record<string, string>) => ({ ...headers, 'content-type': 'application/json' });

async function entryFor(userId: string, status: 'confirmed' | 'pending' = 'confirmed') {
  const [row] = await db.insert(schema.entries).values({
    userId, challengeId: await challengeId(), photoKey: `photos/${userId}/x.jpg`,
    takenAt: NOW, localDate: '2026-09-22', status,
  }).returning();
  await db.insert(schema.entryCategories).values({ entryId: row!.id, category: 'exercise', source: 'user' });
  return row!;
}

beforeEach(async () => { await resetDb(); sender.reset(); clock = NOW; });

describe('hearts', () => {
  it('PUT then DELETE move the count 0 → 1 → 1 → 0 and heartedByMe follows', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const entry = await entryFor(owner.user.id);

    const first = await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ heartCount: 1, heartedByMe: true });

    const again = await (await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers })).json();
    expect(again).toEqual({ heartCount: 1, heartedByMe: true });

    const gone = await (await app.request(`/entries/${entry.id}/heart`, { method: 'DELETE', headers: me.headers })).json();
    expect(gone).toEqual({ heartCount: 0, heartedByMe: false });
    const never = await (await app.request(`/entries/${entry.id}/heart`, { method: 'DELETE', headers: me.headers })).json();
    expect(never).toEqual({ heartCount: 0, heartedByMe: false });
  });

  it('counts other members and pushes the owner once per ten minutes', async () => {
    const owner = await asUser('owner', { activate: true, name: 'Khoa' });
    await db.insert(schema.deviceTokens).values({ userId: owner.user.id, token: 't1', platform: 'ios', locale: 'vi' });
    const a = await asUser('a', { activate: true, name: 'Linh' });
    const b = await asUser('b', { activate: true, name: 'Mai' });
    const entry = await entryFor(owner.user.id);

    await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: a.headers });
    const second = await (await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: b.headers })).json();
    expect(second).toEqual({ heartCount: 2, heartedByMe: true });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.title).toBe('Linh đã thả tim');

    clock = new Date(NOW.getTime() + 11 * 60 * 1000);
    await app.request(`/entries/${entry.id}/heart`, { method: 'DELETE', headers: b.headers });
    await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: b.headers });
    expect(sender.sent).toHaveLength(2);
  });

  it('hearting my own entry works but sends nothing', async () => {
    const me = await asUser('me', { activate: true });
    await db.insert(schema.deviceTokens).values({ userId: me.user.id, token: 't1', platform: 'ios', locale: 'vi' });
    const entry = await entryFor(me.user.id);
    const res = await (await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: me.headers })).json();
    expect(res).toEqual({ heartCount: 1, heartedByMe: true });
    expect(sender.sent).toHaveLength(0);
  });

  it('is 404 on a pending entry and on an unknown id', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const pending = await entryFor(owner.user.id, 'pending');
    expect((await app.request(`/entries/${pending.id}/heart`, { method: 'PUT', headers: me.headers })).status).toBe(404);
    expect((await app.request('/entries/00000000-0000-4000-8000-000000000000/heart', { method: 'PUT', headers: me.headers })).status).toBe(404);
    expect((await app.request('/entries/garbage/heart', { method: 'PUT', headers: me.headers })).status).toBe(400);
  });

  it('requires an active member', async () => {
    const owner = await asUser('owner', { activate: true });
    const pending = await asUser('newbie');
    const entry = await entryFor(owner.user.id);
    expect((await app.request(`/entries/${entry.id}/heart`, { method: 'PUT', headers: pending.headers })).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/api test -- social.test`
Expected: FAIL — `createApp` rejects `sender`/`now` (typecheck) and the routes answer 404 `Route not found`.

- [ ] **Step 3: Create the router with the heart routes**

`apps/api/src/routes/social.ts`:

```ts
import { Hono } from 'hono';
import { and, count, eq } from 'drizzle-orm';
import { schema, type HeartResponse } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';
import { validate, uuidParam } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { notifyEntryOwner, type SocialPushDeps } from '../services/social-push.js';

type EntryRow = typeof schema.entries.$inferSelect;

/** The feed only shows confirmed entries, so reacting to anything else is a 404 even by id. */
async function confirmedEntry(id: string): Promise<EntryRow> {
  const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, id), eq(schema.entries.status, 'confirmed')));
  if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
  return entry;
}

async function heartCount(entryId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.entryHearts).where(eq(schema.entryHearts.entryId, entryId));
  return row?.n ?? 0;
}

/**
 * Hearts and comments on feed entries (feed social spec §B). Mounted at `/` so it can own both
 * `/entries/:id/…` and `/comments/:id` without `entries.ts` learning about either.
 */
export function socialRoutes(deps: SocialPushDeps = {}) {
  const r = new Hono<AuthEnv>();
  r.use('/entries/:id/*', authenticate, requireActive);
  r.use('/comments/:id', authenticate, requireActive);

  r.put('/entries/:id/heart', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    const inserted = await db.insert(schema.entryHearts).values({ entryId: entry.id, userId: user.id }).onConflictDoNothing().returning({ entryId: schema.entryHearts.entryId });
    // Only a heart that was actually new is worth a push; re-tapping must not re-notify.
    if (inserted.length > 0) await notifyEntryOwner({ entry, actor: { id: user.id, displayName: user.displayName }, kind: 'heart' }, deps);
    return c.json({ heartCount: await heartCount(entry.id), heartedByMe: true } satisfies HeartResponse);
  });

  r.delete('/entries/:id/heart', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    await db.delete(schema.entryHearts).where(and(eq(schema.entryHearts.entryId, entry.id), eq(schema.entryHearts.userId, user.id)));
    return c.json({ heartCount: await heartCount(entry.id), heartedByMe: false } satisfies HeartResponse);
  });

  return r;
}
```

Check `AuthUser` in `apps/api/src/middleware/auth.ts` exposes `displayName` (it is the `users` row); if it is typed narrower, use `c.get('user')` as the row it is.

In `apps/api/src/app.ts`: import `{ socialRoutes }` and `type SocialPushDeps`; change the signature to `createApp(deps: Partial<EntryDeps & PlaceDeps & SocialPushDeps> = {})`; mount **before** `readRoutes`:

```ts
  app.route('/', socialRoutes({ sender: deps.sender, now: deps.now }));
  app.route('/', readRoutes);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @skinny/api test -- social.test`
Expected: PASS (5 tests). If `requireActive` returns a different status for a pending member, read `middleware/auth.ts` and fix the expectation, not the middleware.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/social.ts apps/api/src/app.ts apps/api/test/social.test.ts
git commit -m "feat(api): PUT/DELETE /entries/:id/heart with an owner push"
```

---

### Task 5: Comment routes

**Files:**
- Modify: `apps/api/src/routes/social.ts`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `GET /entries/:id/comments` → `CommentsResponse`; `POST /entries/:id/comments { body }` → `201 PostCommentResponse`; `DELETE /comments/:id` → `204`.
- Consumes: `commentBody`, `CommentDto`, `commentExcerpt` (Tasks 1–2).

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/test/social.test.ts`:

```ts
describe('comments', () => {
  it('posts, lists oldest first, and marks what I may delete', async () => {
    const owner = await asUser('owner', { activate: true, name: 'Khoa' });
    const me = await asUser('me', { activate: true, name: 'Linh' });
    const entry = await entryFor(owner.user.id);

    const posted = await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body: '  Giỏi quá!  ' }) });
    expect(posted.status).toBe(201);
    const first = await posted.json();
    expect(first.commentCount).toBe(1);
    expect(first.comment).toMatchObject({ entryId: entry.id, body: 'Giỏi quá!', canDelete: true, user: { id: me.user.id, displayName: 'Linh' } });

    clock = new Date(NOW.getTime() + 1000);
    await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(owner.headers), body: JSON.stringify({ body: 'Cảm ơn!' }) });

    const mine = await (await app.request(`/entries/${entry.id}/comments`, { headers: me.headers })).json();
    expect(mine.comments.map((c: { body: string }) => c.body)).toEqual(['Giỏi quá!', 'Cảm ơn!']);
    expect(mine.comments.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([true, false]);

    // The owner may delete anything on their entry.
    const owners = await (await app.request(`/entries/${entry.id}/comments`, { headers: owner.headers })).json();
    expect(owners.comments.map((c: { canDelete: boolean }) => c.canDelete)).toEqual([true, true]);
  });

  it('pushes the owner with the excerpt, once per ten minutes', async () => {
    const owner = await asUser('owner', { activate: true });
    await db.insert(schema.deviceTokens).values({ userId: owner.user.id, token: 't1', platform: 'ios', locale: 'en' });
    const me = await asUser('me', { activate: true, name: 'Linh' });
    const entry = await entryFor(owner.user.id);
    const long = 'b'.repeat(100);
    await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body: long }) });
    await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body: 'again' }) });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ title: 'Linh commented', body: `“${'b'.repeat(80)}…”`, data: { kind: 'comment', entryId: entry.id } });
  });

  it('lets the author and the owner delete, and nobody else', async () => {
    const owner = await asUser('owner', { activate: true });
    const author = await asUser('author', { activate: true });
    const stranger = await asUser('stranger', { activate: true });
    const entry = await entryFor(owner.user.id);
    const make = async () => (await (await app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(author.headers), body: JSON.stringify({ body: 'x' }) })).json()).comment.id as string;

    const c1 = await make();
    expect((await app.request(`/comments/${c1}`, { method: 'DELETE', headers: stranger.headers })).status).toBe(403);
    expect((await app.request(`/comments/${c1}`, { method: 'DELETE', headers: author.headers })).status).toBe(204);
    const c2 = await make();
    expect((await app.request(`/comments/${c2}`, { method: 'DELETE', headers: owner.headers })).status).toBe(204);
    expect((await app.request(`/comments/${c2}`, { method: 'DELETE', headers: owner.headers })).status).toBe(404);
    const left = await (await app.request(`/entries/${entry.id}/comments`, { headers: owner.headers })).json();
    expect(left.comments).toEqual([]);
  });

  it('rejects whitespace and over-long bodies, and pending entries', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const entry = await entryFor(owner.user.id);
    const post = (body: string) => app.request(`/entries/${entry.id}/comments`, { method: 'POST', headers: json(me.headers), body: JSON.stringify({ body }) });
    expect((await post('   ')).status).toBe(400);
    expect((await post('x'.repeat(501))).status).toBe(400);
    expect((await post('x'.repeat(500))).status).toBe(201);
    const pending = await entryFor(owner.user.id, 'pending');
    expect((await app.request(`/entries/${pending.id}/comments`, { headers: me.headers })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/api test -- social.test`
Expected: the four new tests FAIL with 404 `Route not found`.

- [ ] **Step 3: Add the comment routes**

In `social.ts`, extend the imports:

```ts
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { commentBody, commentExcerpt, schema, type CommentDto, type CommentsResponse, type HeartResponse, type PostCommentResponse } from '@skinny/shared';
import { storage } from '../services/storage.js';
```

Add helpers under `heartCount`:

```ts
const COMMENTS_MAX = 200;

async function commentCount(entryId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.entryComments).where(eq(schema.entryComments.entryId, entryId));
  return row?.n ?? 0;
}

type CommentRow = typeof schema.entryComments.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

async function toCommentDto(row: CommentRow, author: UserRow, viewerId: string, entryOwnerId: string): Promise<CommentDto> {
  return {
    id: row.id,
    entryId: row.entryId,
    user: { id: author.id, displayName: author.displayName, avatarUrl: author.avatarKey ? await storage.publicUrl(author.avatarKey) : null },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    canDelete: viewerId === row.userId || viewerId === entryOwnerId,
  };
}
```

Add the routes inside `socialRoutes` after the heart routes:

```ts
  r.get('/entries/:id/comments', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    const rows = await db.select({ comment: schema.entryComments, author: schema.users })
      .from(schema.entryComments).innerJoin(schema.users, eq(schema.users.id, schema.entryComments.userId))
      .where(eq(schema.entryComments.entryId, entry.id)).orderBy(asc(schema.entryComments.createdAt)).limit(COMMENTS_MAX);
    const comments: CommentDto[] = [];
    for (const { comment, author } of rows) comments.push(await toCommentDto(comment, author, user.id, entry.userId));
    return c.json({ comments } satisfies CommentsResponse);
  });

  r.post('/entries/:id/comments', validate('param', uuidParam), validate('json', commentBody), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    const { body } = c.req.valid('json');
    const [row] = await db.insert(schema.entryComments).values({ entryId: entry.id, userId: user.id, body, createdAt: deps.now?.() ?? new Date() }).returning();
    await notifyEntryOwner({ entry, actor: { id: user.id, displayName: user.displayName }, kind: 'comment', excerpt: commentExcerpt(body) }, deps);
    const [author] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    return c.json({ comment: await toCommentDto(row!, author!, user.id, entry.userId), commentCount: await commentCount(entry.id) } satisfies PostCommentResponse, 201);
  });

  r.delete('/comments/:id', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const [found] = await db.select({ comment: schema.entryComments, entry: schema.entries })
      .from(schema.entryComments).innerJoin(schema.entries, eq(schema.entries.id, schema.entryComments.entryId))
      .where(eq(schema.entryComments.id, c.req.valid('param').id));
    if (!found) throw new ApiError(404, 'not_found', 'Comment not found');
    if (found.comment.userId !== user.id && found.entry.userId !== user.id) throw new ApiError(403, 'forbidden', 'Not your comment');
    await db.delete(schema.entryComments).where(eq(schema.entryComments.id, found.comment.id));
    return c.body(null, 204);
  });
```

`createdAt` takes the injected clock so the "oldest first" test is deterministic under a fast test run; production passes no `now` and gets `new Date()`. Remove `inArray` from the import if unused.

- [ ] **Step 4: Run the whole API suite**

Run: `pnpm --filter @skinny/api test`
Expected: PASS except `read.test.ts`/typecheck on the feed literal, which Task 6 fixes. If `validate('json', commentBody)` answers a code other than `invalid_body` for whitespace, check `validate.ts` — the existing `invalid_body` code is what zod failures map to.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/social.ts apps/api/test/social.test.ts
git commit -m "feat(api): comments on feed entries — list, post with owner push, delete by author or owner"
```

---

### Task 6: Feed aggregation

**Files:**
- Modify: `apps/api/src/routes/read.ts:96-111`
- Test: `apps/api/test/social.test.ts`

**Interfaces:**
- Produces: `GET /feed` rows carry `heartCount`, `commentCount`, `heartedByMe`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/test/social.test.ts`:

```ts
describe('GET /feed social fields', () => {
  it('carries counts and my own heart flag, computed per page', async () => {
    const owner = await asUser('owner', { activate: true });
    const me = await asUser('me', { activate: true });
    const other = await asUser('other', { activate: true });
    const hearted = await entryFor(owner.user.id);
    const plain = await entryFor(owner.user.id);
    await app.request(`/entries/${hearted.id}/heart`, { method: 'PUT', headers: me.headers });
    await app.request(`/entries/${hearted.id}/heart`, { method: 'PUT', headers: other.headers });
    await app.request(`/entries/${hearted.id}/comments`, { method: 'POST', headers: json(other.headers), body: JSON.stringify({ body: 'hi' }) });

    const feed = await (await app.request('/feed', { headers: me.headers })).json();
    const byId = Object.fromEntries(feed.entries.map((e: { id: string }) => [e.id, e]));
    expect(byId[hearted.id]).toMatchObject({ heartCount: 2, commentCount: 1, heartedByMe: true });
    expect(byId[plain.id]).toMatchObject({ heartCount: 0, commentCount: 0, heartedByMe: false });

    const theirs = await (await app.request('/feed', { headers: owner.headers })).json();
    expect(theirs.entries.find((e: { id: string }) => e.id === hearted.id)).toMatchObject({ heartCount: 2, heartedByMe: false });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @skinny/api test -- social.test`
Expected: FAIL — the feed rows have no `heartCount`.

- [ ] **Step 3: Aggregate in the feed handler**

In `read.ts`, add `count, inArray` to the drizzle import. Replace the body of `readRoutes.get('/feed', …)` after `rows` is fetched:

```ts
  const ids = rows.map(({ entry }) => entry.id);
  const me = c.get('user');
  const [heartRows, commentRows, mine] = ids.length === 0 ? [[], [], []] : await Promise.all([
    db.select({ entryId: schema.entryHearts.entryId, n: count() }).from(schema.entryHearts).where(inArray(schema.entryHearts.entryId, ids)).groupBy(schema.entryHearts.entryId),
    db.select({ entryId: schema.entryComments.entryId, n: count() }).from(schema.entryComments).where(inArray(schema.entryComments.entryId, ids)).groupBy(schema.entryComments.entryId),
    db.select({ entryId: schema.entryHearts.entryId }).from(schema.entryHearts).where(and(inArray(schema.entryHearts.entryId, ids), eq(schema.entryHearts.userId, me.id))),
  ]);
  const hearts = new Map(heartRows.map((r) => [r.entryId, r.n]));
  const comments = new Map(commentRows.map((r) => [r.entryId, r.n]));
  const hearted = new Set(mine.map((r) => r.entryId));

  const entries: FeedEntryDto[] = [];
  for (const { entry, user } of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, entry.id))).map((r) => r.category as Category);
    entries.push({
      ...(await toEntryDto(entry, cats)),
      user: await userDto(user),
      heartCount: hearts.get(entry.id) ?? 0,
      commentCount: comments.get(entry.id) ?? 0,
      heartedByMe: hearted.has(entry.id),
    });
  }
```

Keep the `nextCursor` line as is.

- [ ] **Step 4: Run the API suite and typecheck**

Run: `pnpm --filter @skinny/api typecheck && pnpm --filter @skinny/api test`
Expected: both PASS in full.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/read.ts apps/api/test/social.test.ts
git commit -m "feat(api): heart and comment counts and my heart flag on GET /feed"
```

---

### Task 7: API client, mock client and seed

**Files:**
- Modify: `packages/api-client/src/types.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/mock/seed.ts`, `mock/admin-seed.ts`, `mock/client.ts`
- Test: `packages/api-client/test/mock.test.ts`

**Interfaces:**
- Produces on `ApiClient`:
  ```ts
  heartEntry(id: string): Promise<HeartResponse>;
  unheartEntry(id: string): Promise<HeartResponse>;
  comments(entryId: string): Promise<CommentsResponse>;
  postComment(entryId: string, body: string): Promise<PostCommentResponse>;
  deleteComment(id: string): Promise<void>;
  ```
- `Seed` gains `hearts: SeedHeart[]` and `comments: SeedComment[]`; `MEMBER_COMMENTS` exported.
- Re-exports `HeartResponse`, `CommentDto`, `CommentsResponse`, `PostCommentResponse`, `NOTIFICATION_KINDS` widened.

- [ ] **Step 1: Write the failing mock tests**

Append to `packages/api-client/test/mock.test.ts` (use the file's existing `createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 })` style — read the top of the file and match its helper name):

```ts
describe('hearts and comments', () => {
  it('seeds hearted entries and comments so every feed state appears', async () => {
    const api = createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 });
    const { entries } = await api.feed();
    expect(entries.some((e) => e.heartCount > 0)).toBe(true);
    expect(entries.some((e) => e.heartedByMe)).toBe(true);
    expect(entries.some((e) => e.heartCount === 0 && e.commentCount === 0)).toBe(true);
    expect(entries.some((e) => e.commentCount > 0)).toBe(true);
  });

  it('hearts idempotently and unhearts', async () => {
    const api = createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 });
    const target = (await api.feed()).entries.find((e) => !e.heartedByMe)!;
    const before = target.heartCount;
    expect(await api.heartEntry(target.id)).toEqual({ heartCount: before + 1, heartedByMe: true });
    expect(await api.heartEntry(target.id)).toEqual({ heartCount: before + 1, heartedByMe: true });
    expect(await api.unheartEntry(target.id)).toEqual({ heartCount: before, heartedByMe: false });
    expect((await api.feed()).entries.find((e) => e.id === target.id)!.heartedByMe).toBe(false);
  });

  it('posts, lists oldest first with canDelete, and deletes', async () => {
    const api = createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 });
    const target = (await api.feed()).entries.find((e) => e.commentCount === 0 && e.userId !== api.seed.me.id)!;
    const posted = await api.postComment(target.id, '  Giỏi quá  ');
    expect(posted.comment).toMatchObject({ body: 'Giỏi quá', canDelete: true, user: { id: api.seed.me.id } });
    expect(posted.commentCount).toBe(1);
    const list = await api.comments(target.id);
    expect(list.comments.map((c) => c.id)).toEqual([posted.comment.id]);
    await api.deleteComment(posted.comment.id);
    expect((await api.comments(target.id)).comments).toEqual([]);
    expect((await api.feed()).entries.find((e) => e.id === target.id)!.commentCount).toBe(0);
  });

  it('refuses a stranger delete with 403 and a non-confirmed entry with 404', async () => {
    const api = createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 });
    const seeded = api.seed.comments.find((c) => c.userId !== api.seed.me.id)!;
    const entry = api.seed.entries.find((e) => e.id === seeded.entryId)!;
    if (entry.userId === api.seed.me.id) throw new Error('pick a seeded comment on someone else’s entry');
    await expect(api.deleteComment(seeded.id)).rejects.toMatchObject({ status: 403 });
    await expect(api.heartEntry('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
  });
});
```

If the seed happens to put every stranger comment on my entry, adjust `MEMBER_COMMENTS` placement in Step 3 rather than the test.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/api-client test -- mock`
Expected: FAIL — `heartEntry` is not a function.

- [ ] **Step 3: Types and live client**

In `types.ts`: add `HeartResponse, CommentDto, CommentsResponse, PostCommentResponse` to the `@skinny/shared/wire` re-export list under "Read models", and change the kinds constant:

```ts
/** Mirrors `notification_kind` in packages/shared/src/db/schema.ts. */
export const NOTIFICATION_KINDS = ['inactive_1d', 'inactive_3d', 'inactive_7d', 'rank_nudge', 'heart', 'comment'] as const;
```

In `client.ts`, add to the `ApiClient` interface after `feed`:

```ts
  heartEntry(id: string): Promise<HeartResponse>;
  unheartEntry(id: string): Promise<HeartResponse>;
  comments(entryId: string): Promise<CommentsResponse>;
  postComment(entryId: string, body: string): Promise<PostCommentResponse>;
  deleteComment(id: string): Promise<void>;
```

and the implementations next to `feed()`:

```ts
  heartEntry(id: string): Promise<HeartResponse> {
    return this.request<HeartResponse>(`/entries/${id}/heart`, { method: 'PUT' });
  }

  unheartEntry(id: string): Promise<HeartResponse> {
    return this.request<HeartResponse>(`/entries/${id}/heart`, { method: 'DELETE' });
  }

  comments(entryId: string): Promise<CommentsResponse> {
    return this.request<CommentsResponse>(`/entries/${entryId}/comments`);
  }

  postComment(entryId: string, body: string): Promise<PostCommentResponse> {
    return this.request<PostCommentResponse>(`/entries/${entryId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    });
  }

  async deleteComment(id: string): Promise<void> {
    await this.request<void>(`/comments/${id}`, { method: 'DELETE' });
  }
```

Match how `confirmEntry`/`deleteEntry` in the same file set JSON headers and handle a 204 body — copy their exact pattern.

- [ ] **Step 4: Seed**

In `mock/seed.ts`, add to the `Seed` interface:

```ts
  hearts: SeedHeart[];
  comments: SeedComment[];
```

with, above it:

```ts
export interface SeedHeart { entryId: string; userId: string; createdAt: string }
export interface SeedComment { id: string; entryId: string; userId: string; body: string; createdAt: string }

/** Vietnamese, like the rest of the seed; cycled onto every fourth confirmed entry. */
export const MEMBER_COMMENTS = ['Giỏi quá!', 'Mai chạy chung không?', 'Nhìn ngon ghê.', 'Cố lên nha!'];
```

In `makeSeed`, after `entries.sort(...)` and before `return`, build the fixtures:

```ts
  const hearts: SeedHeart[] = [];
  const comments: SeedComment[] = [];
  entries.forEach((entry, index) => {
    if (entry.status !== 'confirmed') return;
    // Every second entry is hearted by one to three *other* members, the first of whom is me
    // when I am not the author — so "hearted by me", "hearted by others" and "no hearts" all
    // appear on the first page.
    if (index % 2 === 0) {
      const others = users.filter((u) => u.id !== entry.userId).slice(0, 1 + (index % 3));
      for (const u of others) hearts.push({ entryId: entry.id, userId: u.id, createdAt: entry.createdAt });
    }
    if (index % 4 === 1) {
      const author = users.find((u) => u.id !== entry.userId)!;
      comments.push({
        id: `cccccccc-0000-4000-8000-${String(index).padStart(12, '0')}`,
        entryId: entry.id,
        userId: author.id,
        body: MEMBER_COMMENTS[index % MEMBER_COMMENTS.length]!,
        createdAt: entry.createdAt,
      });
    }
  });
```

and add `hearts, comments,` to the returned object. In `mock/admin-seed.ts`, add `hearts: [], comments: [],` to its returned seed.

- [ ] **Step 5: Mock client**

In `mock/client.ts`, change `feed()` to fold the fields in:

```ts
    const entries = page.items.flatMap<FeedEntryDto>((entry) => {
      const author = this.state.users.find((user) => user.id === entry.userId);
      if (!author) return [];
      const hearts = this.state.hearts.filter((h) => h.entryId === entry.id);
      return [{
        ...toEntryDto(entry),
        user: summary(author),
        heartCount: hearts.length,
        commentCount: this.state.comments.filter((c) => c.entryId === entry.id).length,
        heartedByMe: hearts.some((h) => h.userId === this.state.me.id),
      }];
    });
```

Add a section after `deleteEntry`:

```ts
  // MARK: - Hearts & comments

  private confirmedEntry(id: string): AdminEntry {
    const entry = this.state.entries.find((row) => row.id === id && row.status === 'confirmed');
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    return entry;
  }

  private heartState(entryId: string): HeartResponse {
    const hearts = this.state.hearts.filter((h) => h.entryId === entryId);
    return { heartCount: hearts.length, heartedByMe: hearts.some((h) => h.userId === this.state.me.id) };
  }

  async heartEntry(id: string): Promise<HeartResponse> {
    await this.delay();
    const entry = this.confirmedEntry(id);
    if (!this.state.hearts.some((h) => h.entryId === entry.id && h.userId === this.state.me.id)) {
      this.state.hearts.push({ entryId: entry.id, userId: this.state.me.id, createdAt: new Date().toISOString() });
    }
    return this.heartState(entry.id);
  }

  async unheartEntry(id: string): Promise<HeartResponse> {
    await this.delay();
    const entry = this.confirmedEntry(id);
    this.state.hearts = this.state.hearts.filter((h) => !(h.entryId === entry.id && h.userId === this.state.me.id));
    return this.heartState(entry.id);
  }

  private toCommentDto(row: SeedComment, entryOwnerId: string): CommentDto {
    const author = this.state.users.find((u) => u.id === row.userId) ?? this.state.me;
    return {
      id: row.id,
      entryId: row.entryId,
      user: summary(author),
      body: row.body,
      createdAt: row.createdAt,
      canDelete: row.userId === this.state.me.id || entryOwnerId === this.state.me.id,
    };
  }

  async comments(entryId: string): Promise<CommentsResponse> {
    await this.delay();
    const entry = this.confirmedEntry(entryId);
    const comments = this.state.comments
      .filter((c) => c.entryId === entry.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => this.toCommentDto(c, entry.userId));
    return { comments };
  }

  async postComment(entryId: string, body: string): Promise<PostCommentResponse> {
    await this.delay();
    const entry = this.confirmedEntry(entryId);
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > ENTRY_COMMENT_MAX) throw new ApiError(400, 'invalid_body', 'Comment body is invalid');
    this.counter += 1;
    const row: SeedComment = {
      id: `dddddddd-0000-4000-8000-${String(this.counter).padStart(12, '0')}`,
      entryId: entry.id,
      userId: this.state.me.id,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    this.state.comments.push(row);
    return { comment: this.toCommentDto(row, entry.userId), commentCount: this.state.comments.filter((c) => c.entryId === entry.id).length };
  }

  async deleteComment(id: string): Promise<void> {
    await this.delay();
    const row = this.state.comments.find((c) => c.id === id);
    if (!row) throw new ApiError(404, 'not_found', 'Comment not found');
    const entry = this.state.entries.find((e) => e.id === row.entryId);
    if (row.userId !== this.state.me.id && entry?.userId !== this.state.me.id) throw new ApiError(403, 'forbidden', 'Not your comment');
    this.state.comments = this.state.comments.filter((c) => c.id !== id);
  }
```

Import `ENTRY_COMMENT_MAX` from `@skinny/shared/wire`, the DTO types from `../types`, and `SeedComment` from `./seed`. `ApiError` is already imported in this file (used by `confirmEntry`).

- [ ] **Step 6: Run api-client tests and the downstream typechecks**

Run: `pnpm --filter @skinny/api-client test && pnpm --filter @skinny/api-client typecheck && pnpm --filter @skinny/admin typecheck`
Expected: PASS. (`admin` typecheck passes now because `NOTIFICATION_KINDS` is widened; its `kinds.*` labels come in Task 13.) `web` typecheck still fails on `feed.test.tsx` literals until Task 10.

- [ ] **Step 7: Commit**

```bash
git add packages/api-client
git commit -m "feat(api-client): heart and comment methods, mock routes and seeded fixtures"
```

---

### Task 8: Web foundations — query keys, glyphs, cache patches, copy

**Files:**
- Modify: `apps/web/src/lib/query.ts`
- Modify: `apps/web/src/app/icons.tsx`
- Create: `apps/web/src/features/feed/feed-model.ts`
- Test: `apps/web/src/features/feed/feed-model.test.ts`
- Modify: `apps/web/messages/vi.json`, `apps/web/messages/web-only.json`

**Interfaces:**
- Produces: `queryKeys.comments(entryId)`; `HeartGlyph({ filled?: boolean })`, `CommentGlyph`; pure functions
  ```ts
  type FeedPages = InfiniteData<FeedResponse, string | undefined>;
  toggleHeartInFeed(data: FeedPages, entryId: string): FeedPages
  settleHeartInFeed(data: FeedPages, entryId: string, truth: HeartResponse): FeedPages
  setCommentCountInFeed(data: FeedPages, entryId: string, count: number): FeedPages
  ```
- Copy keys: `feed.heart`, `feed.unheart`, `feed.heartCount`, `feed.comments`, `feed.commentCount`, `feed.edit`, `feed.heartFailed`, `comments.title`, `comments.empty`, `comments.placeholder`, `comments.loadFailed`, `comments.postFailed`, `comments.deleteFailed`, `time.now`, `time.minutes`, `time.hours`, `time.days`.

- [ ] **Step 1: Write the failing model tests**

`apps/web/src/features/feed/feed-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import type { FeedEntryDto, FeedResponse } from '@skinny/shared/wire';
import { setCommentCountInFeed, settleHeartInFeed, toggleHeartInFeed } from './feed-model';

const entry = (id: string, over: Partial<FeedEntryDto> = {}): FeedEntryDto => ({
  id, userId: 'u1', photoUrl: 'x', thumbUrl: null, takenAt: '2026-09-14T03:00:00.000Z', localDate: '2026-09-14',
  status: 'confirmed', categories: ['exercise'], placeName: null, placeSource: 'none', title: null, note: null,
  createdAt: '2026-09-14T03:00:01.000Z', user: { id: 'u1', displayName: 'Khoa', avatarUrl: null },
  heartCount: 0, commentCount: 0, heartedByMe: false, ...over,
});

const pages = (): InfiniteData<FeedResponse, string | undefined> => ({
  pageParams: [undefined, 'c1'],
  pages: [
    { entries: [entry('a'), entry('b', { heartCount: 2, heartedByMe: true })], nextCursor: 'c1' },
    { entries: [entry('c', { heartCount: 5 })], nextCursor: null },
  ],
});

describe('toggleHeartInFeed', () => {
  it('flips exactly one entry, across pages, and leaves the rest untouched', () => {
    const next = toggleHeartInFeed(pages(), 'c');
    expect(next.pages[1]!.entries[0]).toMatchObject({ heartCount: 6, heartedByMe: true });
    expect(next.pages[0]!.entries[0]).toMatchObject({ heartCount: 0, heartedByMe: false });
    expect(next.pages[0]!.entries[1]).toMatchObject({ heartCount: 2, heartedByMe: true });
  });

  it('unhearts down but never below zero', () => {
    const next = toggleHeartInFeed(pages(), 'b');
    expect(next.pages[0]!.entries[1]).toMatchObject({ heartCount: 1, heartedByMe: false });
    const zeroed = toggleHeartInFeed(toggleHeartInFeed(pages(), 'a'), 'a');
    expect(zeroed.pages[0]!.entries[0]).toMatchObject({ heartCount: 0, heartedByMe: false });
    const forced = { ...pages(), pages: [{ entries: [entry('z', { heartCount: 0, heartedByMe: true })], nextCursor: null }] };
    expect(toggleHeartInFeed(forced, 'z').pages[0]!.entries[0]!.heartCount).toBe(0);
  });

  it('does not mutate its input', () => {
    const before = pages();
    toggleHeartInFeed(before, 'a');
    expect(before.pages[0]!.entries[0]!.heartCount).toBe(0);
  });
});

describe('settleHeartInFeed and setCommentCountInFeed', () => {
  it('adopt the server truth for one entry', () => {
    const settled = settleHeartInFeed(pages(), 'a', { heartCount: 3, heartedByMe: true });
    expect(settled.pages[0]!.entries[0]).toMatchObject({ heartCount: 3, heartedByMe: true });
    const counted = setCommentCountInFeed(pages(), 'c', 4);
    expect(counted.pages[1]!.entries[0]!.commentCount).toBe(4);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/web exec vitest run src/features/feed/feed-model`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `feed-model.ts`**

```ts
import type { InfiniteData } from '@tanstack/react-query';
import type { FeedEntryDto, FeedResponse, HeartResponse } from '@skinny/shared/wire';

export type FeedPages = InfiniteData<FeedResponse, string | undefined>;

/** Applies `patch` to the one entry with `entryId`, wherever it sits in the paged cache. */
function patchEntry(data: FeedPages, entryId: string, patch: (entry: FeedEntryDto) => FeedEntryDto): FeedPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      entries: page.entries.map((entry) => (entry.id === entryId ? patch(entry) : entry)),
    })),
  };
}

/** The optimistic flip: the flag inverts and the count follows, floored at zero. */
export function toggleHeartInFeed(data: FeedPages, entryId: string): FeedPages {
  return patchEntry(data, entryId, (entry) => ({
    ...entry,
    heartedByMe: !entry.heartedByMe,
    heartCount: Math.max(0, entry.heartCount + (entry.heartedByMe ? -1 : 1)),
  }));
}

/** The server's answer replaces the guess. */
export function settleHeartInFeed(data: FeedPages, entryId: string, truth: HeartResponse): FeedPages {
  return patchEntry(data, entryId, (entry) => ({ ...entry, ...truth }));
}

export function setCommentCountInFeed(data: FeedPages, entryId: string, count: number): FeedPages {
  return patchEntry(data, entryId, (entry) => ({ ...entry, commentCount: count }));
}
```

- [ ] **Step 4: Query key, glyphs and copy**

`apps/web/src/lib/query.ts`, inside `queryKeys`:

```ts
  /** One entry's comment thread, opened from the feed card. */
  comments: (entryId: string) => ['comments', entryId] as const,
```

`apps/web/src/app/icons.tsx`, after `PhotoStackGlyph` (match the file's `Glyph` wrapper and 24-unit stroke style):

```tsx
/** The feed card's heart (`heart` / `heart.fill` on iOS). `filled` swaps the stroke for a fill. */
export function HeartGlyph({ filled = false, ...props }: GlyphProps & { filled?: boolean }) {
  return (
    <Glyph {...props} {...(filled ? { fill: 'currentColor' } : {})}>
      <path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />
    </Glyph>
  );
}

/** The feed card's comment bubble (`bubble.right` on iOS). */
export function CommentGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z" />
    </Glyph>
  );
}
```

If `Glyph` does not spread unknown props onto the `<svg>`, extend it to accept an optional `fill` prop and pass it through.

`apps/web/messages/vi.json` — add to the `feed` block:

```json
    "heart": "Thả tim",
    "unheart": "Bỏ tim",
    "heartCount": "{0} tim",
    "comments": "Bình luận",
    "commentCount": "{0} bình luận",
    "edit": "Sửa",
    "heartFailed": "Không thả tim được, hãy thử lại."
```

and two new top-level blocks (keep the file's ordering: put them after `feed`):

```json
  "comments": {
    "title": "Bình luận",
    "empty": "Chưa có bình luận nào. Hãy là người đầu tiên!",
    "placeholder": "Viết bình luận…",
    "send": "Gửi",
    "loadFailed": "Không tải được bình luận.",
    "postFailed": "Không gửi được bình luận, hãy thử lại.",
    "deleteFailed": "Không xoá được bình luận."
  },
  "time": {
    "now": "Vừa xong",
    "minutes": "{0} phút",
    "hours": "{0} giờ",
    "days": "{0} ngày"
  },
```

`apps/web/messages/web-only.json` — one entry per key above, `{ "vi": <same>, "en": … }`:

| key | en |
|---|---|
| feed.heart | Send a heart |
| feed.unheart | Remove heart |
| feed.heartCount | {0} hearts |
| feed.comments | Comments |
| feed.commentCount | {0} comments |
| feed.edit | Edit |
| feed.heartFailed | Couldn't send the heart, please try again. |
| comments.title | Comments |
| comments.empty | No comments yet. Be the first! |
| comments.placeholder | Write a comment… |
| comments.send | Send |
| comments.loadFailed | Couldn't load the comments. |
| comments.postFailed | Couldn't post the comment, please try again. |
| comments.deleteFailed | Couldn't delete the comment. |
| time.now | Just now |
| time.minutes | {0} min |
| time.hours | {0} h |
| time.days | {0} d |

Then regenerate: `cd apps/web && node scripts/seed-messages.mjs && cd ../..` — expected `wrote … keys`, no "no translation" list.

- [ ] **Step 5: Run the model tests and the catalog test**

Run: `pnpm --filter @skinny/web exec vitest run src/features/feed/feed-model src/i18n/messages`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/query.ts apps/web/src/app/icons.tsx apps/web/src/features/feed/feed-model.ts apps/web/src/features/feed/feed-model.test.ts apps/web/messages
git commit -m "feat(web): feed social foundations — cache patches, heart/comment glyphs, copy"
```

---

### Task 9: Lift the edit controller out of the history screen

**Files:**
- Create: `apps/web/src/features/track/use-entry-editor.tsx`
- Modify: `apps/web/src/features/account/history.tsx`
- Test: `apps/web/src/features/account/history.test.tsx` (unchanged — it is the regression proof)

**Interfaces:**
- Produces:
  ```ts
  export function useEntryEditor(): {
    openEdit: (entry: EntryDto & { points?: number }) => void;
    /** The verdict sheet and the delete dialog, or null while closed. Render it once. */
    element: ReactNode;
    /** `errors.*` key of the last failed delete; the screen decides where to show it. */
    deleteErrorKey: string | null;
  }
  ```

- [ ] **Step 1: Confirm the baseline is green**

Run: `pnpm --filter @skinny/web exec vitest run src/features/account`
Expected: PASS. Note the count; it must not change.

- [ ] **Step 2: Create the hook**

`apps/web/src/features/track/use-entry-editor.tsx` — move, verbatim, from `history.tsx`: `NO_CAPS`, the `sheet`/`deleting`/`isDeleting`/`deleteErrorKey` state, the `alive` ref, `invalidateScoring`, `openEdit`, `confirmDelete`, `primary`, and the JSX for `VerdictSheet` + `ConfirmDialog`. Shape:

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { Category, EntryDto } from '@skinny/shared/wire';
import { CATEGORIES } from '@skinny/shared/wire';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { ConfirmDialog } from '@/features/account/confirm-dialog';
import { VerdictSheet } from './verdict-sheet';
import { beginSave, failSave, initVerdictState, needsSave, patchBody, type VerdictState } from './verdict-model';

/** No cap is known for a past day until the edit's `PATCH` answers — ruling 2 (Task 8). */
const NO_CAPS: Record<Category, boolean> = Object.fromEntries(
  CATEGORIES.map((category) => [category, false]),
) as Record<Category, boolean>;

/**
 * The verdict sheet in `{ kind: 'edit' }` mode plus its delete confirmation, as one controller
 * shared by the Ghi nhận history and the group feed's "Sửa". The rules for what may be saved
 * live in `verdict-model.ts`; this hook only owns the request lifecycle and the refetches.
 */
export function useEntryEditor() {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<VerdictState | null>(null);
  const [deleting, setDeleting] = useState<EntryDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const invalidateScoring = useCallback(() => { /* moved verbatim */ }, [queryClient]);
  const openEdit = useCallback((entry: EntryDto & { points?: number }) => { /* moved verbatim */ }, []);
  const confirmDelete = () => { /* moved verbatim */ };
  const primary = () => { /* moved verbatim */ };

  const element: ReactNode = (
    <>
      {sheet ? <VerdictSheet /* moved verbatim */ /> : null}
      {deleting ? <ConfirmDialog /* moved verbatim */ /> : null}
    </>
  );

  return { openEdit, element, deleteErrorKey };
}
```

(The `/* moved verbatim */` bodies are the exact code currently at `history.tsx:73-190` and `:278-304`; cut and paste them, then delete them from `history.tsx`.)

- [ ] **Step 3: Use it in `history.tsx`**

Replace the moved state and callbacks with:

```ts
  const { openEdit, element: editor, deleteErrorKey } = useEntryEditor();
```

keep the `deleteErrorKey` banner where it is, keep `onEdit={() => openEdit(entry)}`, and render `{editor}` where the sheet and dialog used to be. Remove the imports `history.tsx` no longer needs (`ConfirmDialog`, `VerdictSheet`, `beginSave`, `failSave`, `initVerdictState`, `needsSave`, `patchBody`, `VerdictState`, `describeError` if unused, `EntryDto` if unused).

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `pnpm --filter @skinny/web exec vitest run src/features/account src/features/track && pnpm --filter @skinny/web typecheck && pnpm --filter @skinny/web lint`
Expected: the same passing count as Step 1, typecheck clean except `feed.test.tsx` literals (Task 10), lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/track/use-entry-editor.tsx apps/web/src/features/account/history.tsx
git commit -m "refactor(web): lift the entry edit controller out of history into useEntryEditor"
```

---

### Task 10: Feed card action row — heart, comment count, Sửa

**Files:**
- Modify: `apps/web/src/features/feed/feed.tsx`
- Modify: `apps/web/src/screens/overview.tsx:92`
- Test: `apps/web/src/features/feed/feed.test.tsx`

**Interfaces:**
- Produces: `FeedSection({ meId?: string | null })`; `FeedRow` props `{ entry, meId, onHeart(entry), onComment(entry), onEdit(entry) }`; test ids `feed-heart`, `feed-heart-count`, `feed-comment`, `feed-comment-count`, `feed-edit`, `feed-heart-error`.
- Consumes: Task 8 model + copy, Task 9 hook, Task 7 mock.

- [ ] **Step 1: Fix the fixture and write the failing tests**

In `feed.test.tsx`, the "no location" test spreads `page.entries[0]!` — it already carries the new fields from the mock, so nothing changes there. Add these tests inside the describe:

```tsx
  it('shows the seeded heart and comment counts and my pressed state', async () => {
    renderFeed(seeded());
    const rows = await screen.findAllByTestId('feed-row');
    const hearted = rows.find((row) => within(row).getByTestId('feed-heart').getAttribute('aria-pressed') === 'true');
    expect(hearted).toBeDefined();
    expect(Number(within(hearted!).getByTestId('feed-heart-count').textContent)).toBeGreaterThan(0);
    const commented = rows.find((row) => within(row).queryByTestId('feed-comment-count'));
    expect(commented).toBeDefined();
  });

  it('a tap flips the heart at once and the mock keeps it', async () => {
    const api = seeded();
    renderFeed(api);
    const rows = await screen.findAllByTestId('feed-row');
    const row = rows.find((r) => within(r).getByTestId('feed-heart').getAttribute('aria-pressed') === 'false')!;
    const button = within(row).getByTestId('feed-heart');
    const before = Number(within(row).queryByTestId('feed-heart-count')?.textContent ?? '0');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(within(row).getByTestId('feed-heart-count')).toHaveTextContent(String(before + 1));

    await waitFor(() => expect(api.seed.hearts.some((h) => h.entryId === row.getAttribute('data-entry-id') && h.userId === api.seed.me.id)).toBe(true));
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('rolls the heart back and shows a banner when the request fails', async () => {
    const api = seeded();
    vi.spyOn(api, 'heartEntry').mockRejectedValue(new TypeError('offline'));
    renderFeed(api);
    const rows = await screen.findAllByTestId('feed-row');
    const row = rows.find((r) => within(r).getByTestId('feed-heart').getAttribute('aria-pressed') === 'false')!;
    const button = within(row).getByTestId('feed-heart');
    await userEvent.click(button);
    await screen.findByTestId('feed-heart-error');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers "Sửa" only on my own rows and opens the edit sheet with the title prefilled', async () => {
    const api = seeded();
    const mine = api.seed.entries.find((e) => e.status === 'confirmed' && e.userId === api.seed.me.id)!;
    mine.title = 'Chạy bộ tối';
    renderFeed(api, api.seed.me.id);
    const rows = await screen.findAllByTestId('feed-row');
    const myRow = rows.find((r) => r.getAttribute('data-entry-id') === mine.id)!;
    const theirRow = rows.find((r) => r.getAttribute('data-entry-id') !== mine.id && !within(r).queryByTestId('feed-edit'))!;
    expect(theirRow).toBeDefined();

    await userEvent.click(within(myRow).getByTestId('feed-edit'));
    const sheet = await screen.findByTestId('verdict-sheet');
    expect(within(sheet).getByTestId('verdict-title')).toHaveValue('Chạy bộ tối');
  });

  it('renders no "Sửa" at all without a signed-in id', async () => {
    renderFeed(seeded());
    await screen.findAllByTestId('feed-row');
    expect(screen.queryByTestId('feed-edit')).not.toBeInTheDocument();
  });
```

Change `renderFeed` to accept the id: `function renderFeed(api: ApiClient, meId: string | null = null)` and render `<FeedSection meId={meId} />`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/web exec vitest run src/features/feed/feed.test`
Expected: the five new tests FAIL (`feed-heart` not found).

- [ ] **Step 3: Implement the action row**

In `feed.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CommentGlyph, HeartGlyph, MapPinGlyph } from '@/app/icons';   // keep existing glyph imports too
import { describeError } from '@/lib/api';
import { useEntryEditor } from '@/features/track/use-entry-editor';
import { CommentSheet } from './comment-sheet';   // Task 12 — until then, see the note below
import { settleHeartInFeed, toggleHeartInFeed, type FeedPages } from './feed-model';
```

**Until Task 12 lands**, do not import `CommentSheet`; keep `onComment` wired to a `setCommenting(entry.id)` state and render nothing for it. Task 12 replaces that `null` with the sheet.

`FeedSection` signature and additions:

```tsx
export function FeedSection({ meId = null }: { meId?: string | null } = {}) {
  …existing…
  const queryClient = useQueryClient();
  const editor = useEntryEditor();
  const [commenting, setCommenting] = useState<string | null>(null);
  const [heartErrorKey, setHeartErrorKey] = useState<string | null>(null);

  /**
   * Optimistic: the cache flips before the request, the answer settles it, an error rolls it
   * back to the snapshot. One mutation for both directions — the entry's current flag decides
   * which request goes out.
   */
  const heart = useMutation({
    mutationFn: (entry: FeedEntryDto) =>
      entry.heartedByMe ? api.unheartEntry(entry.id) : api.heartEntry(entry.id),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed });
      const snapshot = queryClient.getQueryData<FeedPages>(queryKeys.feed);
      if (snapshot) queryClient.setQueryData<FeedPages>(queryKeys.feed, toggleHeartInFeed(snapshot, entry.id));
      setHeartErrorKey(null);
      return { snapshot };
    },
    onSuccess: (truth, entry) => {
      const current = queryClient.getQueryData<FeedPages>(queryKeys.feed);
      if (current) queryClient.setQueryData<FeedPages>(queryKeys.feed, settleHeartInFeed(current, entry.id, truth));
    },
    onError: (error, _entry, context) => {
      if (context?.snapshot) queryClient.setQueryData(queryKeys.feed, context.snapshot);
      setHeartErrorKey(describeError(error));
    },
  });
```

Render the error banner above the day sections:

```tsx
      {heartErrorKey ? (
        <AlertBanner tone="destructive" title={t('feed.heartFailed')} description={t(heartErrorKey)} data-testid="feed-heart-error" />
      ) : null}
```

(If `AlertBanner` does not forward `data-testid`, wrap it in a `<div data-testid="feed-heart-error">`.)

Pass the handlers down: `<FeedRow key={entry.id} entry={entry} meId={meId} onHeart={() => heart.mutate(entry)} onComment={() => setCommenting(entry.id)} onEdit={() => editor.openEdit(entry)} />`, and render `{editor.element}` at the end of the section.

`FeedRow`:

```tsx
function FeedRow({ entry, meId, onHeart, onComment, onEdit }: {
  entry: FeedEntryDto;
  meId: string | null;
  onHeart: () => void;
  onComment: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations();
  const mine = meId !== null && entry.userId === meId;
  return (
    <SurfaceCard as="article" padding="none" className="overflow-hidden">
      <div data-testid="feed-row" data-entry-id={entry.id}>
        …photo, author, title, note, chips, place as today…
        <div className="flex items-center gap-1 pt-1">
          <button
            type="button"
            data-testid="feed-heart"
            aria-pressed={entry.heartedByMe}
            aria-label={entry.heartedByMe ? t('feed.unheart') : t('feed.heart')}
            onClick={onHeart}
            className={cn(
              'flex min-h-11 items-center gap-1.5 rounded-full px-2 outline-ring',
              entry.heartedByMe ? 'text-primary' : 'text-foreground-secondary',
            )}
          >
            <HeartGlyph filled={entry.heartedByMe} className="size-5" />
            {entry.heartCount > 0 ? (
              <span data-testid="feed-heart-count" className="type-label tabular-nums">{entry.heartCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            data-testid="feed-comment"
            aria-label={t('feed.comments')}
            onClick={onComment}
            className="text-foreground-secondary flex min-h-11 items-center gap-1.5 rounded-full px-2 outline-ring"
          >
            <CommentGlyph className="size-5" />
            {entry.commentCount > 0 ? (
              <span data-testid="feed-comment-count" className="type-label tabular-nums">{entry.commentCount}</span>
            ) : null}
          </button>
          {mine ? (
            <Button size="sm" variant="ghost" data-testid="feed-edit" className="ml-auto" onClick={onEdit}>
              {t('feed.edit')}
            </Button>
          ) : null}
        </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
```

The existing "leaves a row with no location untappable" test filters buttons by `data-testid !== 'photo-button'`; extend that filter to also exclude `feed-heart` and `feed-comment` (they are buttons by design), and keep its assertion that nothing else is.

`overview.tsx:92`: `<FeedSection meId={userId} />` — `Overview` is prop-free and `OverviewScreen` computes `userId`; thread `meId` from `OverviewScreen` into `Overview` as an optional prop defaulting to `null`, so the screen's own tests keep rendering `<Overview />` unchanged.

- [ ] **Step 4: Run the feed and overview tests, typecheck, lint**

Run: `pnpm --filter @skinny/web exec vitest run src/features/feed src/screens && pnpm --filter @skinny/web typecheck && pnpm --filter @skinny/web lint`
Expected: PASS, clean, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/feed apps/web/src/screens/overview.tsx
git commit -m "feat(web): heart, comment count and Sửa on the feed card"
```

---

### Task 11: Relative time helper

**Files:**
- Create: `apps/web/src/lib/relative-time.ts`
- Test: `apps/web/src/lib/relative-time.test.ts`

**Interfaces:**
- Produces: `relativeTimeKey(iso: string, now: Date): { key: 'time.now' | 'time.minutes' | 'time.hours' | 'time.days'; value: number } | null` — `null` means "older than seven days, show the date with `formatLocalDay`".

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { relativeTimeKey } from './relative-time';

const NOW = new Date('2026-09-22T10:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTimeKey', () => {
  it('buckets by minutes, hours and days', () => {
    expect(relativeTimeKey(ago(30_000), NOW)).toEqual({ key: 'time.now', value: 0 });
    expect(relativeTimeKey(ago(5 * 60_000), NOW)).toEqual({ key: 'time.minutes', value: 5 });
    expect(relativeTimeKey(ago(3 * 3_600_000), NOW)).toEqual({ key: 'time.hours', value: 3 });
    expect(relativeTimeKey(ago(2 * 86_400_000), NOW)).toEqual({ key: 'time.days', value: 2 });
  });

  it('hands anything older than seven days back for a date', () => {
    expect(relativeTimeKey(ago(7 * 86_400_000 + 1), NOW)).toBeNull();
    expect(relativeTimeKey(ago(7 * 86_400_000), NOW)).toEqual({ key: 'time.days', value: 7 });
  });

  it('treats a clock ahead of the server as now', () => {
    expect(relativeTimeKey(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toEqual({ key: 'time.now', value: 0 });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter @skinny/web exec vitest run src/lib/relative-time`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export type RelativeTimeKey = 'time.now' | 'time.minutes' | 'time.hours' | 'time.days';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Which catalog string a timestamp reads as, relative to `now`: under a minute is "Vừa xong",
 * then whole minutes, hours and days up to a week. Beyond that the caller shows the date, so a
 * comment thread never says "43 ngày".
 */
export function relativeTimeKey(iso: string, now: Date): { key: RelativeTimeKey; value: number } | null {
  const delta = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (delta < MINUTE) return { key: 'time.now', value: 0 };
  if (delta < HOUR) return { key: 'time.minutes', value: Math.floor(delta / MINUTE) };
  if (delta < DAY) return { key: 'time.hours', value: Math.floor(delta / HOUR) };
  if (delta <= 7 * DAY) return { key: 'time.days', value: Math.floor(delta / DAY) };
  return null;
}
```

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter @skinny/web exec vitest run src/lib/relative-time` — PASS.

```bash
git add apps/web/src/lib/relative-time.ts apps/web/src/lib/relative-time.test.ts
git commit -m "feat(web): relativeTimeKey for comment timestamps"
```

---

### Task 12: Comment sheet

**Files:**
- Create: `apps/web/src/features/feed/comment-sheet.tsx`
- Modify: `apps/web/src/features/feed/feed.tsx` (render the sheet)
- Test: `apps/web/src/features/feed/comment-sheet.test.tsx`

**Interfaces:**
- Produces: `CommentSheet({ entryId, onDismiss, onCountChange(count: number) })`; test ids `comment-sheet`, `comment-list`, `comment-row`, `comment-delete`, `comment-input`, `comment-send`, `comment-empty`, `comment-error`.
- Consumes: `api.comments/postComment/deleteComment` (Task 7), `queryKeys.comments` and copy (Task 8), `relativeTimeKey` (Task 11), `setCommentCountInFeed` (Task 8), `useModalSheet`.

- [ ] **Step 1: Write the failing tests**

`comment-sheet.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import { render, screen, waitFor, within } from '@/test/intl';
import { CommentSheet } from './comment-sheet';

const seeded = () => createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 });

function renderSheet(api: ApiClient, entryId: string, onCountChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  render(<CommentSheet entryId={entryId} onDismiss={() => {}} onCountChange={onCountChange} />, { wrapper: Wrapper });
  return { onCountChange };
}

describe('the comment sheet', () => {
  it('lists the seeded comments oldest first with the author and a relative time', async () => {
    const api = seeded();
    const withComments = api.seed.comments[0]!;
    renderSheet(api, withComments.entryId);
    const rows = await screen.findAllByTestId('comment-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(within(rows[0]!).getByText(withComments.body)).toBeInTheDocument();
  });

  it('posts, clears the composer, and reports the new count', async () => {
    const api = seeded();
    const entry = api.seed.entries.find((e) => e.status === 'confirmed' && !api.seed.comments.some((c) => c.entryId === e.id))!;
    const { onCountChange } = renderSheet(api, entry.id);
    await screen.findByTestId('comment-empty');

    const input = screen.getByTestId('comment-input');
    const send = screen.getByTestId('comment-send');
    expect(send).toBeDisabled();
    await userEvent.type(input, '   ');
    expect(send).toBeDisabled();
    await userEvent.type(input, 'Giỏi quá!');
    expect(send).toBeEnabled();
    await userEvent.click(send);

    const row = await screen.findByTestId('comment-row');
    expect(row).toHaveTextContent('Giỏi quá!');
    expect(input).toHaveValue('');
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
  });

  it('shows Xoá only where I may delete, and deleting drops the row and the count', async () => {
    const api = seeded();
    const theirs = api.seed.comments.find((c) => {
      const entry = api.seed.entries.find((e) => e.id === c.entryId)!;
      return c.userId !== api.seed.me.id && entry.userId !== api.seed.me.id;
    })!;
    const { onCountChange } = renderSheet(api, theirs.entryId);
    const before = (await screen.findAllByTestId('comment-row')).length;
    expect(screen.queryByTestId('comment-delete')).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId('comment-input'), 'mine');
    await userEvent.click(screen.getByTestId('comment-send'));
    const del = await screen.findByTestId('comment-delete');
    await userEvent.click(del);
    await waitFor(() => expect(screen.getAllByTestId('comment-row')).toHaveLength(before));
    expect(onCountChange).toHaveBeenLastCalledWith(before);
  });

  it('keeps the text and shows a banner when posting fails', async () => {
    const api = seeded();
    vi.spyOn(api, 'postComment').mockRejectedValue(new TypeError('offline'));
    const entry = api.seed.entries.find((e) => e.status === 'confirmed')!;
    renderSheet(api, entry.id);
    await screen.findByTestId('comment-list');
    await userEvent.type(screen.getByTestId('comment-input'), 'hello');
    await userEvent.click(screen.getByTestId('comment-send'));
    await screen.findByTestId('comment-error');
    expect(screen.getByTestId('comment-input')).toHaveValue('hello');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @skinny/web exec vitest run src/features/feed/comment-sheet`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sheet**

```tsx
import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { CommentDto } from '@skinny/shared/wire';
import { ENTRY_COMMENT_MAX } from '@skinny/shared/wire';
import { AlertBanner, Avatar, EmptyState, cn } from '@skinny/ui';
import { CloseGlyph, CommentGlyph } from '@/app/icons';
import { useModalSheet } from '@/app/use-modal-sheet';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { relativeTimeKey } from '@/lib/relative-time';
import { Button } from '@/ui/button';

export interface CommentSheetProps {
  entryId: string;
  onDismiss: () => void;
  /** The thread's size after a post or a delete, for the feed card's count. */
  onCountChange: (count: number) => void;
}

/**
 * One entry's comment thread as a bottom sheet (feed social spec §F): the list oldest first,
 * a pinned composer, and "Xoá" where the server says I may. Same modality as the verdict sheet.
 */
export function CommentSheet({ entryId, onDismiss, onCountChange }: CommentSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  useModalSheet({ panelRef: panel, onDismiss });

  const thread = useQuery({
    queryKey: queryKeys.comments(entryId),
    queryFn: () => api.comments(entryId),
  });
  const comments = thread.data?.comments ?? [];

  const post = useMutation({
    mutationFn: (body: string) => api.postComment(entryId, body),
    onSuccess: async (response) => {
      setDraft('');
      setErrorKey(null);
      onCountChange(response.commentCount);
      await queryClient.invalidateQueries({ queryKey: queryKeys.comments(entryId) });
    },
    onError: (error) => setErrorKey(describeError(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(id),
    onSuccess: async () => {
      setErrorKey(null);
      const fresh = await queryClient.fetchQuery({ queryKey: queryKeys.comments(entryId), queryFn: () => api.comments(entryId) });
      onCountChange(fresh.comments.length);
    },
    onError: (error) => setErrorKey(describeError(error)),
  });

  const canSend = draft.trim().length > 0 && !post.isPending;
  const now = new Date();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div aria-hidden="true" onClick={onDismiss} className="absolute inset-0 bg-black/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="comment-sheet"
        className={cn('relative flex max-h-[92svh] w-full max-w-[520px] flex-col', 'bg-background rounded-t-xl shadow-popover outline-none')}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span aria-hidden="true" className="bg-border-strong h-1 w-9 rounded-full" />
        </div>
        <header className="flex min-h-11 items-center gap-2 px-4">
          <h2 id={titleId} className="type-h3 min-w-0 flex-1 truncate">{t('comments.title')}</h2>
          <button type="button" onClick={onDismiss} aria-label={t('common.close')} className="text-foreground-secondary grid size-11 shrink-0 place-items-center rounded-full">
            <CloseGlyph className="size-4" />
          </button>
        </header>

        <div data-scroll-container data-testid="comment-list" className="flex min-h-[160px] flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-2 pb-3">
          {thread.isPending ? <div aria-busy="true" className="bg-surface-2 h-[120px] animate-pulse rounded-xl" /> : null}
          {thread.error ? (
            <AlertBanner tone="destructive" title={t('comments.loadFailed')} description={t(describeError(thread.error))}
              action={<Button size="sm" variant="secondary" onClick={() => void thread.refetch()}>{t('common.retry')}</Button>} />
          ) : null}
          {thread.isSuccess && comments.length === 0 ? (
            <div data-testid="comment-empty">
              <EmptyState icon={<CommentGlyph className="size-8" />} title={t('comments.empty')} />
            </div>
          ) : null}
          {comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} now={now} locale={locale}
              onDelete={comment.canDelete ? () => remove.mutate(comment.id) : undefined} busy={remove.isPending} />
          ))}
          {errorKey ? (
            <div data-testid="comment-error">
              <AlertBanner tone="destructive" title={t(post.isError ? 'comments.postFailed' : 'comments.deleteFailed')} description={t(errorKey)} />
            </div>
          ) : null}
        </div>

        <form
          className="border-border flex items-end gap-2 border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) post.mutate(draft.trim());
          }}
        >
          <textarea
            data-testid="comment-input"
            value={draft}
            maxLength={ENTRY_COMMENT_MAX}
            rows={1}
            placeholder={t('comments.placeholder')}
            aria-label={t('comments.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
            className="border-border bg-card text-foreground type-body-medium outline-ring placeholder:text-foreground-subtle max-h-[112px] min-h-11 flex-1 resize-none rounded-md border px-3 py-2"
          />
          <Button type="submit" size="md" data-testid="comment-send" disabled={!canSend}>
            {post.isPending ? t('common.sending') : t('comments.send')}
          </Button>
        </form>
      </div>
    </div>
  );
}

function CommentRow({ comment, now, locale, onDelete, busy }: {
  comment: CommentDto;
  now: Date;
  locale: string;
  onDelete?: () => void;
  busy: boolean;
}) {
  const t = useTranslations();
  const relative = relativeTimeKey(comment.createdAt, now);
  const when = relative
    ? relative.key === 'time.now' ? t('time.now') : t(relative.key, { 0: relative.value })
    : formatLocalDay(comment.createdAt.slice(0, 10), locale);
  return (
    <div data-testid="comment-row" className="flex items-start gap-2.5">
      <Avatar name={comment.user.displayName} src={comment.user.avatarUrl} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-label">
          <span className="font-medium">{comment.user.displayName}</span>
          <span className="text-foreground-subtle"> · {when}</span>
        </p>
        <p className="type-body whitespace-pre-line">{comment.body}</p>
      </div>
      {onDelete ? (
        <Button size="sm" variant="ghost" data-testid="comment-delete" className="text-destructive" disabled={busy} onClick={onDelete}>
          {t('common.delete')}
        </Button>
      ) : null}
    </div>
  );
}
```

Check `Button` accepts `type="submit"` (add `type` to its props if it hard-codes `type="button"`), and that `t(relative.key, …)` typechecks against use-intl's key union — if not, cast the key as in `capWarnings`' `CapWarningTranslate`.

In `feed.tsx`, replace the Task 10 placeholder: import `CommentSheet` and `setCommentCountInFeed`, and render

```tsx
      {commenting ? (
        <CommentSheet
          entryId={commenting}
          onDismiss={() => setCommenting(null)}
          onCountChange={(count) => {
            const current = queryClient.getQueryData<FeedPages>(queryKeys.feed);
            if (current) queryClient.setQueryData<FeedPages>(queryKeys.feed, setCommentCountInFeed(current, commenting, count));
          }}
        />
      ) : null}
```

Add a feed test:

```tsx
  it('opens the comment sheet from the bubble and the card count follows a post', async () => {
    const api = seeded();
    renderFeed(api);
    const rows = await screen.findAllByTestId('feed-row');
    const row = rows.find((r) => !within(r).queryByTestId('feed-comment-count'))!;
    await userEvent.click(within(row).getByTestId('feed-comment'));
    await screen.findByTestId('comment-sheet');
    await userEvent.type(screen.getByTestId('comment-input'), 'hi');
    await userEvent.click(screen.getByTestId('comment-send'));
    await waitFor(() => expect(within(row).getByTestId('feed-comment-count')).toHaveTextContent('1'));
  });
```

- [ ] **Step 4: Run the feed suites, typecheck, lint, then the whole web suite**

Run: `pnpm --filter @skinny/web exec vitest run src/features/feed && pnpm --filter @skinny/web typecheck && pnpm --filter @skinny/web lint && pnpm --filter @skinny/web test`
Expected: all PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/feed
git commit -m "feat(web): comment sheet on the feed card"
```

---

### Task 13: Admin kind labels

**Files:**
- Modify: `apps/admin/messages/vi.json`, `apps/admin/messages/en.json`
- Test: `apps/admin/src/i18n/messages.test.ts` (existing key-parity test)

- [ ] **Step 1: Add the labels**

In both files, inside the notifications `kinds` block after `rank_nudge`:

vi: `"heart": "Thả tim", "comment": "Bình luận"` · en: `"heart": "Heart", "comment": "Comment"`.

- [ ] **Step 2: Run admin tests and typecheck**

Run: `pnpm --filter @skinny/admin test && pnpm --filter @skinny/admin typecheck`
Expected: PASS. If the notification-log table typechecks `t(\`kinds.${item.kind}\`)` against the message keys, the new labels are exactly what makes it compile.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/messages
git commit -m "feat(admin): labels for the heart and comment notification kinds"
```

---

### Task 14: Full verification, browser check, production migration

**Files:** none new.

- [ ] **Step 1: Everything green**

Run from the root: `pnpm typecheck && pnpm test`
Expected: every package passes (API needs Postgres up and migrated).

- [ ] **Step 2: Browser check in mock mode**

Start the `web-mock` preview (`.claude/launch.json`), mobile viewport, dark. On Trang chủ: a card with a filled heart and a count, a card with none, tap a heart and watch it flip, open a comment bubble, post "Giỏi quá!", see it appear and the count on the card rise, delete it. On one of my own cards tap "Sửa", change the title, save, and see the card update. Screenshot each state for the recap.

- [ ] **Step 3: Production migration**

Pull `DATABASE_PUBLIC_URL` from the Railway `Postgres` service (never print it) and run:

```bash
pnpm --filter @skinny/shared build
DATABASE_URL="$(railway variables --service Postgres --kv | grep -E '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)" pnpm --filter @skinny/api db:migrate
```

Then confirm the two tables exist and `notification_log.entry_id` is present with a one-off `information_schema.columns` query, as done for migration 0004. The new columns and enum values are additive, so the running API keeps working until the code deploys.

- [ ] **Step 4: Merge and push**

Merge the feature branch into `main` with `--no-ff`, push with the `themarcus125` gh account active, and watch the Railway deployments for the merge commit reach `SUCCESS`.

---

## Self-review

**Spec coverage.** §A data → Task 1. §B routes, DTO fields, feed aggregation, tests → Tasks 4–6. §C push, dedupe, templates, deep link, admin table → Tasks 2, 3, 13. §D mock and seed → Task 7. §E action row, optimistic heart, `Sửa`, shared hook, glyphs → Tasks 8–10. §F comment sheet, relative time, composer rules, count sync → Tasks 11–12. §G out of scope: nothing in the plan crosses it.

**Placeholder scan.** Task 9 uses "moved verbatim" markers pointing at exact line ranges of code that exists today; that is a cut-and-paste instruction, not a gap. Task 10 defers `CommentSheet` to Task 12 with an explicit interim state.

**Type consistency.** `HeartResponse { heartCount, heartedByMe }` is used identically in Tasks 1, 4, 7, 8, 10. `PostCommentResponse { comment, commentCount }` in Tasks 1, 5, 7, 12. `notifyEntryOwner(input, deps)` and `SocialPushDeps { sender, now }` in Tasks 3–5 and `createApp` in Task 4. `queryKeys.comments(entryId)` in Tasks 8 and 12. `useEntryEditor() → { openEdit, element, deleteErrorKey }` in Tasks 9 and 10. `FeedSection({ meId })` in Task 10 and the overview.
