# Operation Skinny Legend — App Design

**Date:** 2026-09-11
**Status:** Approved
**Challenge window:** 2026-09-08 → 2026-12-25 (Asia/Ho_Chi_Minh)

## 1. Goal

A native iOS app plus a small backend and admin dashboard that replaces the
"send a photo to the group chat" tracking method with photo-based logging,
AI-assisted category verdicts, derived scoring, a leaderboard, and trends.

Users: one friend group of roughly 5–15 people, all on iPhone, all in Vietnam.

## 2. Rulebook (source of truth)

| Category | Points | Cap |
|---|---|---|
| Exercise (any sport/workout) | +3 | 1 per day |
| Healthy meal | +2 | 1 per day |
| Group activity (with ≥1 other person, in person or video call) | +3 | 2 per week |
| Streak bonus (7 consecutive days unbroken) | +5 | every 7-day milestone |

Decisions made during brainstorming:

- **Stacking:** one photo may carry multiple categories. A group workout earns exercise (+3) and group (+3).
- **Streak day:** a day counts if the user has at least one confirmed scoring entry (exercise or meal) that day. Group-only entries do not keep a streak alive on their own since they always accompany exercise in practice, but see §5 for the exact rule.
- **Caps:** per-day caps use the local calendar day in Asia/Ho_Chi_Minh. Per-week caps use Monday-start weeks in the same timezone. Timezone is fixed server-side.
- **Meal judging:** the AI returns a healthy/not-healthy verdict with a one-sentence reason. The user may override.
- **Photo privacy:** all confirmed entries are visible to every active member in a feed.

## 3. Architecture

```
ios (SwiftUI)  ──REST/JSON──▶  apps/api (Hono, Node 22)  ──▶  Postgres (Railway)
      │ presigned PUT                  │  ▲
      ▼                                ▼  │ same API, admin role
Cloudflare R2 (photos)          OpenRouter (vision LLM)     apps/admin (Next.js, Vercel)
```

- **Monorepo**, pnpm workspaces: `apps/api`, `apps/admin`, `packages/shared`. `ios/` is an Xcode project at the repo root, outside pnpm.
- **Auth:** Firebase Auth (Sign in with Apple, Sign in with Google). iOS sends the Firebase ID token as `Authorization: Bearer`. The API verifies it with the Firebase Admin SDK and upserts a `users` row on first login. New users are `pending` until an admin activates them. Admin dashboard uses Firebase Google sign-in and requires `role = admin`.
- **Hosting:** Railway (API + Postgres), Vercel (admin), Cloudflare R2 (photos, avatars, feedback screenshots). All secrets via env vars.
- **Vision model:** OpenRouter, OpenAI-compatible chat completions with image input. Default model `qwen/qwen3.7-flash`. Model id is an env var (`VISION_MODEL`) so GLM, Kimi, or others can be swapped without a deploy. Expected cost: well under $0.001 per verdict.

## 4. Data model (Drizzle, Postgres)

- `users`: id, firebase_uid (unique), display_name, avatar_key, role (`member`|`admin`), status (`pending`|`active`|`disabled`), created_at.
- `challenges`: id, name, start_date, end_date, timezone, streak_points (5), streak_length (7).
- `scoring_rules`: id, challenge_id, category (`exercise`|`meal`|`group`), points, cap_count, cap_period (`day`|`week`). Admin-editable.
- `entries`: id, user_id, challenge_id, photo_key, thumb_key, taken_at (timestamptz), local_date (date, derived server-side in challenge timezone), status (`pending`|`confirmed`|`rejected`), lat, lng, place_name, place_source (`poi`|`geocode`|`manual`|`none`), created_at, updated_at.
- `entry_categories`: entry_id, category, source (`ai`|`user`|`admin`). Composite PK (entry_id, category).
- `ai_verdicts`: id, entry_id, model, categories_json, healthy (nullable bool), confidence (0–1), reason, raw_response, latency_ms, created_at.
- `feedback`: id, user_id, message, screenshot_key, app_version, created_at.
- `audit_log`: id, actor_id, action, target_type, target_id, diff_json, created_at.

Points are **never stored**. See §5.

## 5. Scoring engine (`packages/shared/scoring`)

One pure function, no I/O:

```ts
computeScore(input: {
  entries: ConfirmedEntry[];   // entries with categories and local_date
  rules: ScoringRule[];
  challenge: { startDate, endDate, timezone, streakPoints, streakLength };
  asOf: LocalDate;
}): {
  total: number;
  byCategory: Record<Category, number>;
  byDay: Record<LocalDate, { points: number; categories: Category[] }>;
  streak: { current: number; longest: number; bonusesAwarded: number };
  capsHit: Record<Category, boolean>;  // for asOf day/week
}
```

Rules:

1. Only `confirmed` entries within the challenge window count.
2. For each category, entries are ordered by `taken_at`. The first `cap_count` entries in each period score `points`; later ones score 0 and are flagged `capped`.
3. Day period = `local_date`. Week period = ISO week (Monday start) of `local_date`.
4. Streak: iterate local days from `startDate` to `asOf`. A day is "active" if it has at least one entry that scored > 0 in `exercise` or `meal`. Consecutive active days increment the streak; a non-active day resets it to 0. Every time the streak reaches a multiple of `streakLength`, award `streakPoints` once. Today counts as active only if it already has a scoring entry; an empty today does not break the streak until the day is over.
5. `total` = sum of category points + streak bonuses.

Leaderboard, dashboard, and trends all call this function per user. Admin edits and user overrides are therefore reflected immediately with no reconciliation.

## 6. API (Hono, REST, Zod-validated)

All routes except `/health` require a Firebase Bearer token. Routes under `/admin` require `role = admin`. Pending users can only call `/auth/session` and `/me`.

**Auth & profile**
- `POST /auth/session` → upsert user from token, return profile + status.
- `GET /me`, `PATCH /me` (display_name, avatar_key).

**Uploads**
- `POST /uploads/presign` body `{ kind: 'photo'|'avatar'|'feedback', contentType }` → `{ key, url, expiresAt }`. URL valid 5 minutes. Client compresses before upload (photos: max 1200px long edge, JPEG q0.8; avatars: 512px square).

**Entries**
- `POST /entries` body `{ photoKey, takenAt, lat?, lng?, placeName?, placeSource? }`. Server fetches the object from R2, calls the vision model, stores `ai_verdicts`, creates a `pending` entry with AI-suggested categories, generates a thumbnail, returns `{ entry, verdict, projectedPoints, capsHit }`. If the model fails or times out (8 s), the entry is still created with no categories and `verdict.failed = true`.
- `PATCH /entries/:id` body `{ categories: Category[], placeName?, placeSource? }` → sets `status = confirmed`, replaces categories with `source = user`. Works on pending and already-confirmed entries (history edit). Owner only.
- `DELETE /entries/:id` owner only, soft-deletes by setting `rejected`.
- `GET /entries/mine?cursor=` history for the Account tab.

**Read models**
- `GET /me/dashboard` → today points, streak, vs-yesterday delta, rank, caps hit, remaining opportunities today.
- `GET /leaderboard` → `[ { user, total, weekDelta, rank } ]`.
- `GET /me/trends` → weekly totals (self + group average, last 8 weeks), heatmap days, category breakdown, rank by week.
- `GET /feed?cursor=` → recent confirmed entries across the group with user, thumbnail, categories, place_name.
- `GET /users/:id/entries` → another member's confirmed entries.

**Feedback**
- `POST /feedback` body `{ message, screenshotKey?, appVersion }`.

**Admin**
- `GET /admin/users`, `PATCH /admin/users/:id` (status, role, display_name).
- `GET /admin/entries?user=&status=&from=&to=`, `PATCH /admin/entries/:id` (categories with `source = admin`, status), `DELETE /admin/entries/:id`.
- `GET /admin/rules`, `PUT /admin/rules`.
- `GET /admin/feedback`.
- Every admin write appends to `audit_log`.

**Vision prompt contract.** System prompt describes the four categories and asks for strict JSON:

```json
{ "categories": ["exercise","group"], "healthy": null, "confidence": 0.82, "reason": "Ảnh chụp tại phòng gym với hai người." }
```

`healthy` is only set when `meal` is among the categories. The reason is one sentence in Vietnamese.

## 7. iOS app (SwiftUI, iOS 17+)

Five tabs: **Track**, **Dashboard**, **Leaderboard**, **Trends**, **Account**.

- **Track:** camera or photo library picker. Client compresses, requests a presigned URL, uploads with progress, then calls `POST /entries`. While uploading, the app fetches one location fix (see §8). The verdict sheet shows the photo, AI reason, detected categories as toggleable chips, projected points, cap warnings, and the location chip. "Không đúng?" expands the chips for editing. Confirm calls `PATCH /entries/:id`.
- **Dashboard:** today's points, streak counter, delta vs yesterday, rank, and a checklist of what can still score today.
- **Leaderboard:** ranked list with avatar, total, weekly delta. Tapping a member shows their confirmed entries.
- **Trends:** Swift Charts. Weekly bars (self vs group average), calendar heatmap of active days (tap opens that day's entries), category breakdown, rank-over-time line.
- **Account:** history grouped by day with edit via the same verdict sheet; avatar change (library pick, square crop, upload via presign, `PATCH /me`); display name; send feedback (text + optional screenshot); app version; sign out.
- **Feed:** accessible from Dashboard as a section or push, shows group entries with place names.
- Networking: `URLSession` + `Codable`, one `APIClient` with a token provider. Firebase iOS SDK for auth only. No Apollo.

## 8. Location

Uses CoreLocation + MapKit only. No Google Maps, no API key, no third-party coordinate sharing.

1. When the user starts a Track flow, request "when in use" permission if not yet decided.
2. If the chosen photo has EXIF GPS, use that. Otherwise take one current-location fix (accuracy ~100 m is fine).
3. Run `MKLocalPointsOfInterestRequest` in a 150 m radius. Pick the nearest POI as `place_name`, `place_source = poi`.
4. If none, reverse-geocode with `CLGeocoder` to ward/district level, `place_source = geocode`.
5. The verdict sheet shows the place as a removable chip. "Đổi" lists the 5 nearest POIs; picking one sets `place_source = manual`.
6. Denied permission or no fix → no chip, `place_source = none`. Nothing else is affected.
7. Feed and history show `place_name` only. Coordinates are stored for a possible future map view and are exposed only via admin routes.

## 9. Admin dashboard (Next.js, shadcn/ui, Vercel)

Pages: **Members** (approve pending, set role, disable), **Entries** (table with thumbnail, user, date, categories, status, AI confidence; override categories, delete), **Rules** (edit points and caps, challenge dates), **Feedback** (read-only list). Uses the same API with a Firebase Bearer token.

## 10. Error handling

- Vision model timeout or malformed JSON → entry created with empty categories, user picks manually, failure logged in `ai_verdicts.raw_response`.
- Upload failure → app retries once, then shows an error and keeps the photo locally so the user can retry.
- Presigned URLs expire after 5 minutes. A weekly cron deletes R2 objects older than 24 h that have no matching `entries`, `users.avatar_key`, or `feedback.screenshot_key`.
- All API errors return `{ error: { code, message } }` with proper HTTP status.
- Pending users see a "waiting for approval" screen in the app.

## 11. Testing

- **Scoring engine:** Vitest unit tests for every rule and boundary: cap reached, week rollover on Monday, midnight in Asia/Ho_Chi_Minh, streak reset, streak bonus at 7/14/21, multi-category stacking, entries outside the challenge window, retroactive edits.
- **API:** integration tests against a Dockerised Postgres covering auth gating, pending users, entry create/confirm/edit/delete, admin override, audit log writes.
- **Vision:** a fixture set of ~20 photos with expected categories, run manually via a script to compare models.
- **iOS:** unit tests for view models and the API client with stubbed responses. UI verified manually on Simulator and TestFlight.

## 12. Build order

1. Monorepo scaffold, Drizzle schema, migrations, scoring engine + tests.
2. API: auth, uploads, entries, vision verdict.
3. API: dashboard, leaderboard, trends, feed, feedback.
4. Admin dashboard.
5. iOS: auth, Track flow with location.
6. iOS: Dashboard, Leaderboard, Trends, Account.
7. Deploy (Railway, Vercel, R2), Apple Developer account, TestFlight.

## 13. Out of scope for v1

Push notifications, widgets, per-user timezones, multiple concurrent challenges, Android, in-app fund tracking (Momo link stays in the group doc).
