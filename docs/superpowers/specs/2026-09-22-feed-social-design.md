# Feed social — edit, hearts and comments

**Date:** 2026-09-22  **Status:** Approved  **Extends:** `2026-09-14-web-pwa-design.md` (feed on Trang chủ), `2026-09-12-v1.1-features-design.md` §E (push)
**Scope:** web + API. iOS is untouched in this pass; everything added is additive on the wire.

Three additions to the group feed (`FeedRow` on Trang chủ):

1. Edit my own activity from its feed card.
2. Heart an activity (Instagram-style like).
3. Comment on an activity: a comment icon beside the heart opens a sheet that lists the comments and lets me write one.

Decisions taken during brainstorming: counts are aggregated at read time (no counters on `entries`); a push goes out for both hearts and comments; comments are a flat list, deletable by their author or the entry's owner; iOS follows later.

## A. Data

Two new tables in `packages/shared/src/db/schema.ts`, one migration (`0005_feed_social`).

```
entry_hearts
  entry_id   uuid  → entries.id  on delete cascade
  user_id    uuid  → users.id
  created_at timestamptz not null default now()
  primary key (entry_id, user_id)

entry_comments
  id         uuid  primary key default gen_random_uuid()
  entry_id   uuid  → entries.id  on delete cascade
  user_id    uuid  → users.id
  body       text  not null                -- 1..500 chars, trimmed
  created_at timestamptz not null default now()
  index (entry_id, created_at)
```

The heart primary key makes "heart" idempotent (`insert … on conflict do nothing`) and "unheart" a plain delete. Comments are hard-deleted; there is no edit.

`notification_log` gains `entry_id uuid null → entries.id on delete set null`, so the per-entry burst dedupe (§C) has something to key on. The existing reminder kinds leave it null.

`notification_kind` gains two values: `heart`, `comment`. `NOTIFICATION_KINDS` in `packages/shared/src/notifications/types.ts` lists only the planner's four kinds; a new `SOCIAL_NOTIFICATION_KINDS` lists these two, and the type `NotificationKind` is the union. The planner (`plan.ts`) is untouched: it never emits the new kinds, and its dedupe query already filters by kind.

## B. API

All routes sit behind `authenticate, requireActive`. Every one of them loads the entry first and answers `404 not_found` unless it exists **and** is `confirmed` — the feed only ever shows confirmed entries, and reacting to a pending or rejected one must not be possible even by id. Own entries may be hearted and commented on (Instagram allows it; it keeps the rules simple); they just send no push (§C).

| Method | Path | Body | Answer |
|---|---|---|---|
| `PUT` | `/entries/:id/heart` | — | `200 { heartCount, heartedByMe: true }` |
| `DELETE` | `/entries/:id/heart` | — | `200 { heartCount, heartedByMe: false }` |
| `GET` | `/entries/:id/comments` | — | `200 { comments: CommentDto[] }` oldest first, capped at 200 |
| `POST` | `/entries/:id/comments` | `{ body }` | `201 { comment: CommentDto, commentCount }` |
| `DELETE` | `/comments/:id` | — | `204`; `403 forbidden` unless I am the comment's author or the entry's owner |

`PUT`/`DELETE` heart are idempotent: hearting twice or unhearting a never-hearted entry still answer `200` with the current truth. Both return the new count so the client can settle its optimistic state on the server's number rather than on arithmetic.

Comment `body`: `z.string().trim().min(1).max(500)`, shared as `ENTRY_COMMENT_MAX = 500` next to the title/note limits in `packages/shared/src/wire/entries.ts`. Whitespace-only is `400 invalid_body`.

Wire types (`packages/shared/src/wire/read.ts`):

```ts
export interface CommentDto {
  id: string;
  entryId: string;
  user: UserSummaryDto;       // id, displayName, avatarUrl
  body: string;
  createdAt: string;          // ISO
  canDelete: boolean;         // author or entry owner, decided server-side
}

export interface FeedEntryDto extends EntryDto {
  user: UserSummaryDto;
  heartCount: number;
  commentCount: number;
  heartedByMe: boolean;
}
```

`GET /feed` (`apps/api/src/routes/read.ts`) folds the three fields in with **three grouped queries per page**, not per row: `count(*) … group by entry_id` over `entry_hearts` and over `entry_comments` for the page's entry ids, and `select entry_id from entry_hearts where user_id = me and entry_id in (…)`. No other entry DTO (history, map, admin) changes.

Routes live in a new `apps/api/src/routes/social.ts` (mounted like `entries.ts`), so `entries.ts` stays about the entry itself. Deleting an entry (`DELETE /entries/:id` sets `rejected`) leaves its hearts and comments in place but they vanish from the feed with it; the cascade only fires on a hard delete, which nothing does today.

### Tests (`apps/api/test/social.test.ts`)

- heart: count goes 0 → 1 → 1 (idempotent) → 0; `heartedByMe` follows; a second user's heart makes 2; the feed row shows the count and my flag; a pending entry is `404`.
- comments: post returns the comment with `canDelete: true` for me; list is oldest first; another member's `canDelete` is false on my comment; the entry owner can delete a comment they did not write; a stranger gets `403`; whitespace and 501-character bodies are `400`; `commentCount` on the feed matches.
- notifications: see §C.

## C. Push notifications

Sent **synchronously from the route**, after the write commits, through the existing `PushSender` (`apps/api/src/services/push.ts`), never from the nightly job. The route must not fail because the push did: send errors are logged and swallowed, exactly as `sendInBatches` in `jobs/notify.ts` does — that helper moves to `services/push.ts` so both callers share it.

Rules:

- Recipient is the entry's owner. **No push when the actor is the owner.**
- **Burst dedupe:** skip the send when `notification_log` has a row for `(recipient, kind, entry_id)` with `sent_at` within the last 10 minutes. So a burst of five hearts is one push, and a comment thread going back and forth is one push per ten minutes per entry. A row is written only when at least one device accepted the message (same rule as the job).
- Locale: the recipient's `users.locale`, like the job.
- Payload `data`: `{ deepLink: 'feed', kind, entryId }`. `'feed'` is already in the web's `TAB_PATHS` (→ `/`) and is ignored by iOS's `PushPayload.tab(from:)` (falls to `nil`, which today means "open normally"). The web feed does not yet scroll to `entryId`; it is carried so a later pass can.

Templates (`packages/shared/src/notifications/templates.ts`), with `NotificationVars` gaining `excerpt?: string` (the comment's first 80 characters, whitespace-collapsed, with an ellipsis when cut):

| kind | vi | en |
|---|---|---|
| `heart` | title `{name} đã thả tim` · body `{name} thích hoạt động của bạn.` | title `{name} sent a heart` · body `{name} liked your activity.` |
| `comment` | title `{name} đã bình luận` · body `“{excerpt}”` | title `{name} commented` · body `“{excerpt}”` |

`{name}` is the actor's `displayName`.

Tests: with the fake sender, a heart from another member sends one message per device of the owner and logs one row with `entry_id`; a second heart within ten minutes sends nothing; one after eleven minutes (injected `now`) sends again; a heart on my own entry sends nothing; a comment push carries the excerpt, cut at 80 characters; a sender that throws leaves the route answering `200`.

The admin "Thông báo" log table renders `kind` as text, so the new kinds appear there without change; its `kind` filter, if typed, widens to the union.

## D. Mock client and seed (`packages/api-client/src/mock`)

`AdminEntry` gains `hearts: string[]` (user ids) and `comments: MockComment[]`. The seed hearts every second entry by one to three other members and puts one or two comments (Vietnamese, from a fixed list) on every fourth, so the mock feed shows every state: no reactions, hearted by me, hearted by others, with comments. The mock implements the five routes with the same rules (idempotent heart, `canDelete`, `404` on non-confirmed) so the component tests exercise real behaviour rather than stubs.

## E. Web — feed card action row

`FeedRow` (`apps/web/src/features/feed/feed.tsx`) gains an action row under the chips and place, before the card's bottom padding:

```
[♡ 3]   [💬 2]                                   [Sửa]   ← only on my entries
```

- **Heart button** (`data-testid="feed-heart"`): outline `HeartGlyph` when not hearted, filled and `text-primary` when hearted, count beside it when > 0. `aria-pressed` follows `heartedByMe`; `aria-label` is "Thả tim" / "Bỏ tim". Tap toggles **optimistically**: the feed's `useInfiniteQuery` cache is patched in place (`setQueryData` on `queryKeys.feed`, walking `pages[].entries[]` by id) to flip the flag and ±1 the count, the request goes out, and the answer's `heartCount` replaces the guess. On error the cache is rolled back to the snapshot and a toast-free inline `AlertBanner` at the top of the feed shows `describeError`. The patch helper `toggleHeartInFeed(pages, entryId)` is a pure function in `feed-model.ts` with unit tests.
- **Comment button** (`data-testid="feed-comment"`): `CommentGlyph` with the count when > 0; `aria-label` "Bình luận". Opens the comment sheet (§F) for that entry.
- **Sửa** (`data-testid="feed-edit"`): shown when `entry.userId === me.id` (the active session's `user.id` from `useSession()`; the feed only renders for an active session). Opens the verdict sheet in `{ kind: 'edit' }` mode with categories, place, title and note, plus delete behind the same `ConfirmDialog` — the exact path the Ghi nhận history already takes.

**Shared edit controller.** The sheet state, `primary`, `confirmDelete`, `invalidateScoring` and the `alive` guard currently inlined in `history.tsx` move into `useEntryEditor()` in `apps/web/src/features/track/use-entry-editor.ts`, returning `{ openEdit(entry), sheetElement }` where `sheetElement` renders the `VerdictSheet` and `ConfirmDialog` (or null). `AccountHistory` and `FeedRow`'s parent both use it; `history.test.tsx` keeps passing unchanged, which is the proof the extraction is behaviour-neutral. After a save or delete the hook invalidates the same scoring keys it does today (feed included), so the card re-renders from the server.

New glyphs in `apps/web/src/app/icons.tsx`: `HeartGlyph` (with a `filled` prop) and `CommentGlyph`, drawn in the file's existing 24-unit stroke style.

## F. Web — comment sheet

`apps/web/src/features/feed/comment-sheet.tsx`, a bottom sheet on `useModalSheet` (same modality as the verdict sheet: focus trap, Escape, backdrop, body scroll lock).

- **Header:** "Bình luận" and the close button.
- **List** (`data-testid="comment-list"`): `useQuery(queryKeys.comments(entryId))` → oldest first; each row is avatar (28 px), display name, relative time ("5 phút", "2 giờ", "3 ngày" via a small `formatRelative(iso, now, locale)` helper with tests, and the `formatLocalDay` date beyond seven days), body with `whitespace-pre-line`, and a "Xoá" ghost button when `canDelete`. Skeleton while pending, `EmptyState` "Chưa có bình luận nào. Hãy là người đầu tiên!" when empty, `AlertBanner` + retry on error.
- **Composer** pinned to the bottom above the safe-area inset: a `textarea` (`data-testid="comment-input"`, `maxLength={ENTRY_COMMENT_MAX}`, one row that grows to four, placeholder "Viết bình luận…") and a "Gửi" button disabled while the trimmed text is empty or a post is in flight. Enter inserts a newline; only the button sends (mobile keyboards). On success the textarea clears, the list refetches, and the feed cache's `commentCount` for that entry is set to the response's `commentCount` (no full feed refetch). On failure the text stays and an inline banner explains.
- **Delete** asks nothing (a comment is cheap and the row shows exactly what is going); on success the list refetches and the feed count decrements via `setQueryData`.

Query keys: `comments: (entryId: string) => ['comments', entryId]` added to `queryKeys`.

Messages: all new strings go in `vi.json` + `web-only.json` (they do not exist in the iOS catalog yet), `en.json` regenerated by `seed-messages.mjs`.

### Component tests

- `feed.test.tsx`: heart shows the seeded count and pressed state; a tap flips it and the count immediately, and the mock's answer keeps it; a failing `heartEntry` rolls both back and shows the banner; the comment count renders; "Sửa" appears only on my rows; tapping it opens the verdict sheet in edit mode with the row's title pre-filled; saving PATCHes and refetches the feed.
- `comment-sheet.test.tsx`: opens with the seeded comments oldest first; posting appends and clears the composer; the send button is disabled on whitespace; "Xoá" only where `canDelete`; deleting removes the row; the feed card's count follows both.
- `feed-model.test.ts`: `toggleHeartInFeed` flips exactly one entry across pages and never goes below zero.
- `relative-time.test.ts`.

## G. Out of scope

- iOS UI for any of this (DTO fields and push kinds are ignored safely today).
- Replies, @mentions, editing a comment, reactions other than a heart, a "who hearted" list.
- Scrolling the feed to `entryId` from a tapped push.
- Realtime updates; the feed refreshes on pull, on focus and after my own actions.
- Admin moderation of comments (the admin's existing entry override can still reject the entry).
