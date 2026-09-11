# Operation Skinny Legend

Photo-based points tracker for the group challenge. See `docs/superpowers/specs/2026-09-11-skinny-legend-design.md`.

## Layout
- `packages/shared` — Drizzle schema, scoring engine, date helpers
- `apps/api` — Hono REST API (Railway)
- `apps/admin` — Next.js admin (Vercel)
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

`AUTH_MODE` must be **unset** in production. It defaults to `firebase`, and the API refuses to
boot when it is `test` while `NODE_ENV=production`. Any missing or empty variable from the list
above also fails the boot with a message naming it.

### Weekly cleanup cron

Add a second Railway service from the same image with no HTTP port:

- Command: `node dist/jobs/cleanup.js`
- Schedule: `0 3 * * 1` (Mondays, 03:00 UTC)
- Same environment variables as the API service

It deletes R2 objects older than 24h that no row references.

### Bootstrapping the first admin

Roles are only editable through the admin API, so the first admin is promoted by hand. Sign in
once from the app to create the user row, then run against the production database:

```sql
UPDATE users SET role='admin', status='active' WHERE firebase_uid='<uid>';
```
