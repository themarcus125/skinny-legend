# Operation Skinny Legend

Photo-based points tracker for the group challenge. See `docs/superpowers/specs/2026-09-11-skinny-legend-design.md`.

## Entry flow
A member's photo is classified by the AI and the entry is confirmed from that verdict
automatically (it scores and appears in the feed, leaderboard and map at once); the member's
"Không đúng?" edit and the admin's override/reject adjust it afterwards. Only an entry whose
verdict failed stays `pending`, with no categories, until the member picks them by hand.
Admins see the AI verdict on every entry in the dashboard and can override its categories or
reject it outright.

## Layout
- `packages/shared` — Drizzle schema, scoring engine, date helpers
- `apps/api` — Hono REST API (Railway)
- `apps/admin` — Next.js 16 admin dashboard (Vercel), standalone: no `@skinny/shared` dependency
- `ios/` — SwiftUI app

## Local dev
```bash
proto install pnpm 10.30.3
pnpm install
cp .env.example apps/api/.env
pnpm --filter @skinny/shared build
pnpm db:up && pnpm db:migrate && pnpm --filter @skinny/api db:seed
pnpm dev:api
```
`@skinny/shared` must be built first — `apps/api` imports it from `dist/`. `pnpm test` and
`pnpm dev:api` build it automatically via their `pre` scripts; a bare `pnpm --filter @skinny/api ...`
does not.

`dotenv` and `drizzle-kit` resolve `.env` relative to the package's own working directory, so `pnpm --filter @skinny/api ...` commands read `apps/api/.env` — a root `.env` is not needed.

`.env.example` ships `AUTH_MODE=test`, so the API boots without Firebase/R2/OpenRouter
credentials. Fill those in and drop the line to exercise the real integrations locally.

## Tests
```bash
pnpm test
```
API tests need the local Postgres running and use `AUTH_MODE=test` (header `x-test-uid`) with in-memory storage.

## Deploy (Railway)

Step-by-step runbooks for the first deploy — Railway, R2, Firebase, Vercel, and the list of
values to collect — live in [`docs/deploy/`](docs/deploy/README.md). The sections below are the
reference for what the code expects.

The runtime image (`apps/api/Dockerfile`) contains only the production dependency tree, so
`drizzle-kit` is **not** available there. Run migrations and the seed from a dev checkout with
the production connection string exported:

```bash
DATABASE_URL=<production url> pnpm --filter @skinny/api db:migrate \
  && DATABASE_URL=<production url> pnpm --filter @skinny/api db:seed
```

The seed is idempotent: it skips when a challenge row already exists.

### Environment variables

Set these on the Railway service (see `.env.example` for the shape):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `PORT` | Provided by Railway; defaults to 3000 |
| `FIREBASE_PROJECT_ID` | Required |
| `FIREBASE_CLIENT_EMAIL` | Required |
| `FIREBASE_PRIVATE_KEY` | Required; `\n` escapes are expanded at runtime |
| `R2_ACCOUNT_ID` | Required |
| `R2_ACCESS_KEY_ID` | Required |
| `R2_SECRET_ACCESS_KEY` | Required |
| `R2_BUCKET` | Defaults to `skinny-legend` |
| `OPENROUTER_API_KEY` | Required |
| `VISION_MODEL` | Defaults to `qwen/qwen3.7-flash` |
| `CORS_ORIGINS` | Comma-separated admin origins; defaults to `http://localhost:3001` |

`AUTH_MODE` must be **unset** in production. It defaults to `firebase`, and the API refuses to
boot when it is `test` while `NODE_ENV=production`. Any missing or empty variable from the list
above also fails the boot with a message naming it.

### Weekly cleanup cron

Add a second Railway service from the same image with no HTTP port. Its settings live in
`railway.cleanup.json` at the repo root, but Railway only reads that file if the service's
**Settings → Config as code → "Railway config file path"** is set to `railway.cleanup.json`; with
the default path the service would pick up the API's `railway.json` (HTTP server, no cron) instead.

- Command: `node dist/jobs/cleanup.js`
- Schedule: `0 3 * * 1` (Mondays, 03:00 UTC)
- Same environment variables as the API service

It deletes R2 objects older than 24h that no row references.

### Daily push cron

Add a third Railway service from the same image with no HTTP port. Its settings live in
`railway.notify.json` at the repo root, but Railway only reads that file if the service's
**Settings → Config as code → "Railway config file path"** is set to `railway.notify.json`; with
the default path the service would pick up the API's config (HTTP server, no cron) instead.

- Command: `node dist/jobs/notify.js`
- Schedule: `0 13 * * *` — 13:00 UTC, which is **20:00 Asia/Ho_Chi_Minh** all year (ICT has no DST)
- Same environment variables as the API service

Each run builds the reminder plan (`packages/shared/src/notifications/plan.ts`) from the current
standings and the last 24 h of `notification_log`, then sends through FCM.

Delivery only goes out for real once `AUTH_MODE=firebase` and `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are all set (SKI-40/42) — the same service
account that verifies ID tokens, plus an **APNs authentication key uploaded to Firebase → Project
settings → Cloud Messaging**. The job shares the API's env gate: with `AUTH_MODE` unset (the
production default) it refuses to boot until the three `FIREBASE_*` vars are present, so create the
Railway cron service once Firebase and the APNs key are configured. Under `AUTH_MODE=test` (local
only) sends go to an in-memory fake that reports success, so `notification_log` rows are still written.

### Bootstrapping the first admin

Roles are only editable through the admin API, so the first admin is promoted by hand. Sign in
once from the app to create the user row, then run against the production database:

```sql
UPDATE users SET role='admin', status='active' WHERE firebase_uid='<uid>';
```

## Admin dashboard (`apps/admin`)

Next.js 16 App Router (Turbopack), Tailwind v4, shadcn/ui, TanStack Query, Firebase Auth (Google
only). It talks to the same Hono API with a Firebase ID token and requires `role=admin` +
`status=active`; anyone else lands on `/not-authorized`. Because the dashboard is served from a
different origin than the API, the API's `CORS_ORIGINS` must list the dashboard's origin.

### Local dev

```bash
cp apps/admin/.env.example apps/admin/.env.local
pnpm dev:admin           # http://localhost:3001
```

`.env.example` ships `NEXT_PUBLIC_MOCK=1`, which swaps the real API client for `MockAdminApi`
(4 members including one pending, 30 entries with AI verdicts, the 3 seeded rules, 2 feedback
rows). Every page renders with no API, no database and no Firebase project. Set
`NEXT_PUBLIC_MOCK=0` and fill the Firebase variables to run against the local API on port 3000.
The API's root `.env` must then include `CORS_ORIGINS=http://localhost:3001` (its default), or
the browser blocks every cross-origin response.

The admin deliberately does not depend on `@skinny/shared`: that package resolves from `dist/`,
and depending on it would force a cross-package build into the Vercel build. The DTO types in
`apps/admin/src/lib/api/types.ts` mirror `apps/api/src/routes/admin.ts` and `toEntryDto` in
`apps/api/src/routes/entries.ts` — change one, change the other.

```bash
pnpm --filter @skinny/admin test        # Vitest + React Testing Library
pnpm --filter @skinny/admin typecheck
```

### Deploy (Vercel)

Create one Vercel project from this repository with these settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `apps/admin` |
| Include source files outside of the Root Directory | **enabled** (the pnpm lockfile lives at the repo root) |
| Install Command | `pnpm install --frozen-lockfile` (Vercel runs it from the workspace root) |
| Build Command | default (`next build`) |
| Node.js Version | 22.x |

No `vercel.json` is needed: `apps/admin` builds on its own and Vercel's pnpm-workspace detection
handles the root install. If a build ever fails on a missing root lockfile, add
`apps/admin/vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @skinny/admin build"
}
```

#### Environment variables

Set these for Production and Preview. Next.js inlines every variable in this table into the
client bundle, so none of them is a secret (Firebase Web config is public by design; access is
enforced by the API's token verification and the `role=admin` check).

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | The Railway API URL, no trailing slash (e.g. `https://skinny-legend-api.up.railway.app`) |
| `NEXT_PUBLIC_MOCK` | `0` — **never** `1` in a deployed environment |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → Project settings → Your apps → Web app |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `skinny-legend.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same project the API verifies tokens against (`FIREBASE_PROJECT_ID`) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | The Web app's app id |

#### On the API side (Railway)

The dashboard is a different origin from the API, so the API must be told to allow it. Set on
the Railway service, alongside the existing variables:

| Variable | Value |
| --- | --- |
| `CORS_ORIGINS` | Comma-separated origins, **scheme and host only, no trailing slash** — e.g. `https://skinny-legend-admin.vercel.app,http://localhost:3001`. Add each preview domain you actually use. |

`apps/api/src/app.ts` echoes back only origins on this list; anything else gets no
`Access-Control-Allow-Origin` header and is blocked by the browser. The default is
`http://localhost:3001`, which covers local dev but **not** the deployed dashboard — forgetting
this variable is the single most likely cause of "the dashboard loads but every request fails".

#### Post-deploy checklist

1. Firebase console → Authentication → Sign-in method: enable **Google**.
2. Firebase console → Authentication → Settings → Authorized domains: add the Vercel
   production domain and `*.vercel.app` preview domains you use.
3. Set `CORS_ORIGINS` on the API to include the Vercel production domain (see the table above)
   and redeploy the API. Verify from the dashboard's browser console by fetching the API's
   `/health` endpoint: it must return `{ ok: true }` with no CORS error. Until this is done the
   dashboard shows "Không kết nối được máy chủ…".
4. Sign in once, then promote yourself with the SQL in "Bootstrapping the first admin" above;
   until then the dashboard shows `/not-authorized`.

## iOS app (`ios/`)

SwiftUI, iOS 26, Liquid Glass. The Xcode project is generated from `ios/project.yml` with
XcodeGen (`ios/*.xcodeproj` is gitignored), so project settings are edited there, not in Xcode.

### Before TestFlight

1. **Apple Developer team** — set `DEVELOPMENT_TEAM` under `settings.configs.Release` in
   `ios/project.yml` (empty today) and regenerate the project; signing fails without it.
2. **`GoogleService-Info.plist`** — drop the file at `ios/SkinnyLegend/GoogleService-Info.plist`.
   It is gitignored and never committed; every machine and CI runner supplies its own copy. With
   it absent the app falls back to mock services (`AppMode.servicesAreLive`).
3. **`aps-environment`** — `ios/SkinnyLegend/SkinnyLegend.entitlements` ships `development`.
   An App Store / TestFlight export must carry `production`, or push tokens are minted against
   the sandbox APNs and every send fails.
4. **Firebase project + APNs key** (SKI-40 / SKI-42) — a real Firebase project with the APNs
   auth key uploaded, and the matching service credentials set on the API, so FCM can deliver.
5. **Production API base URL** — the `API_BASE_URL` Info.plist key, fed per configuration from
   `settings.configs` in `ios/project.yml` (Debug `http://localhost:3000`, Release a documented
   placeholder). Replace the Release value with the deployed Railway URL and regenerate; an
   `API_BASE_URL` process-environment variable still overrides it for a scheme or a device
   pointing at a laptop (`AppMode.resolveBaseURL`: env → Info.plist → localhost).
6. **Code signing** — `ios/project.yml` switches signing off (`CODE_SIGN_STYLE: Manual`,
   `CODE_SIGNING_ALLOWED: NO`) for **Debug only**, so simulator builds and `xcodebuild test` need
   no identity. Release uses `CODE_SIGN_STYLE: Automatic`; check it still matches your provisioning
   once `DEVELOPMENT_TEAM` is set.
7. **`GOOGLE_REVERSED_CLIENT_ID`** — `ios/project.yml` ships the placeholder
   `com.googleusercontent.apps.unconfigured`. Replace it with `REVERSED_CLIENT_ID` from your own
   `GoogleService-Info.plist` and regenerate, or Google Sign-In cannot call back into the app.
