# Railway — API, Postgres and the two cron services (SKI-38, SKI-43)

Railway hosts three services built from the same `apps/api/Dockerfile`, plus a Postgres
database:

| Service | Start command | Shape |
| --- | --- | --- |
| `api` | `node dist/index.js` | HTTP, health check `/health` |
| `cleanup` | `node dist/jobs/cleanup.js` | Cron `0 3 * * 1` |
| `notify` | `node dist/jobs/notify.js` | Cron `0 13 * * *` |

## Where the settings live: the dashboard, not `railway.json`

Railway has deprecated Config-as-code (`railway.json` / `railway.*.json`). Services created after
2026-08-28 cannot opt in, and existing config files stop working on 2026-12-01. The three
`railway*.json` files at the repo root are kept as the reference shape of each service, but
**Railway does not read them** — every setting below is set per service, either in the
dashboard (*service → Settings*) or with the CLI:

```bash
railway link --project <project-id> --environment <environment-id> --service <service-id>
railway environment edit --service-config <service> deploy.startCommand "node dist/index.js"
railway environment edit --service-config <service> deploy.healthcheckPath "/health"
```

(Project, environment and service ids are in the dashboard URL:
`railway.com/project/<project>/service/<service>?environmentId=<environment>`.)

Settings every service built from the API image needs:

| Setting | `api` | `cleanup` | `notify` |
| --- | --- | --- | --- |
| Source → Root Directory | empty | empty | empty |
| Build → Builder | Dockerfile | Dockerfile | Dockerfile |
| Build → Dockerfile Path | `/apps/api/Dockerfile` | same | same |
| Build → Custom Build Command | **empty** | empty | empty |
| Build → Watch Paths | `/apps/api/**`, `/packages/shared/**`, `/pnpm-lock.yaml` | same | same |
| Deploy → Custom Start Command | `node dist/index.js` (or empty: the Dockerfile `CMD` is the same) | `node dist/jobs/cleanup.js` | `node dist/jobs/notify.js` |
| Deploy → Healthcheck Path | `/health` | empty | empty |
| Deploy → Cron Schedule | none | `0 3 * * 1` | `0 13 * * *` |
| Deploy → Restart Policy | On Failure | Never | Never |

Two things bite here:

- **Do not start with `pnpm`.** When Railway creates a service from this monorepo it guesses
  `pnpm --filter @skinny/api build` / `pnpm --filter @skinny/api start`. The build stage of the
  Dockerfile has pnpm, but the runtime stage is plain `node:22-alpine`, so a `pnpm` start command
  fails at *Deploy › Create container* with ``The executable `pnpm` could not be found``. The
  custom build command is ignored for Dockerfile builds; clear it anyway so nobody trusts it.
- **Do not set a Root Directory of `apps/api`.** The build context must be the repo root: the
  image needs the workspace root `package.json`, `pnpm-lock.yaml` and `packages/shared`. With a
  root directory the Dockerfile path stops resolving and the build fails on the missing lockfile.

Railway's monorepo detection also tends to create one service per app (`admin`, `web`, ...).
Only `api` and the two cron jobs belong on Railway; `admin` is on Vercel
(`docs/deploy/admin-vercel.md`). Delete the extras rather than trying to make them build.

## 1. Create the project and the database

1. Railway → **New Project** → **Deploy from GitHub repo** → pick this repository.
2. In the project, **New** → **Database** → **Add PostgreSQL**. Railway creates a `Postgres`
   service and exposes `DATABASE_URL` on it.
3. The GitHub deploy created one service from the repo. Rename it `api`
   (*Settings → Service name*).
4. For the API service, *Settings → Source* → confirm the repo and the branch you deploy from
   (`main`). Leave **Root Directory** empty (see above).
5. Set the *Build* and *Deploy* fields to the `api` column of the table above. Railway pre-fills
   `pnpm --filter ...` commands; replace them.

## 2. Environment variables on the `api` service

Railway's *Variables* tab takes a bulk paste in `KEY=value` form. Every variable below comes
from `apps/api/src/env.ts`; `.env.example` at the repo root has the same shape.

| Variable | Required? | Where the value comes from |
| --- | --- | --- |
| `DATABASE_URL` | yes | Reference the Postgres service: `${{Postgres.DATABASE_URL}}` (Railway's variable-reference syntax — do not paste the literal string). Must parse as a URL. |
| `PORT` | no | Railway injects it. `env.ts` defaults to 3000; `index.ts` reads `process.env.PORT`. Do not set it by hand. |
| `FIREBASE_PROJECT_ID` | yes | Firebase service-account JSON, field `project_id` (see `docs/deploy/firebase.md`). |
| `FIREBASE_CLIENT_EMAIL` | yes | Same JSON, field `client_email`. |
| `FIREBASE_PRIVATE_KEY` | yes | Same JSON, field `private_key`, pasted **with literal `\n`** (see firebase.md). |
| `R2_ACCOUNT_ID` | yes | Cloudflare dashboard → R2 → Account ID (see `docs/deploy/r2.md`). |
| `R2_ACCESS_KEY_ID` | yes | R2 API token, Access Key ID. |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API token, Secret Access Key (shown once). |
| `R2_BUCKET` | no | Defaults to `skinny-legend`. Set it only if you named the bucket differently. |
| `OPENROUTER_API_KEY` | yes | openrouter.ai → Keys. |
| `VISION_MODEL` | no | Defaults to `qwen/qwen3.7-flash`. Override to swap models without a deploy. |
| `AUTH_MODE` | **leave unset** | Defaults to `firebase`. The API throws on boot if it is `test` while `NODE_ENV=production` (the image sets `NODE_ENV=production`). |
| `CORS_ORIGINS` | yes in practice | Comma-separated browser origins, scheme + host only, no trailing slash — the Vercel admin domain. Defaults to `http://localhost:3001`, which does **not** cover the deployed dashboard. See `docs/deploy/admin-vercel.md`. |

How the gates work (`apps/api/src/env.ts`): with `AUTH_MODE=firebase` the three `FIREBASE_*`
vars must be non-empty; with any mode other than `test` the four "service" vars
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `OPENROUTER_API_KEY`) must be
non-empty too. A missing one fails the boot with a message naming it, so a bad deploy is loud,
not silent.

## 3. Migrate and seed (one-off, from a dev checkout)

The runtime image ships only the production dependency tree, so `drizzle-kit` is **not** inside
it — `railway run` against the deployed image cannot migrate. Run both from a local checkout
with the production connection string exported. Copy it from the Postgres service →
*Variables* → `DATABASE_URL` (use the **public** URL if you are outside Railway's network;
the internal `postgres.railway.internal` host only resolves from inside the project).

```bash
pnpm install
pnpm --filter @skinny/shared build          # api/seed import @skinny/shared from dist/
DATABASE_URL='<production url>' pnpm --filter @skinny/api db:migrate
DATABASE_URL='<production url>' pnpm --filter @skinny/api db:seed
```

Notes:

- Both commands run from `apps/api`, so `dotenv` and `drizzle-kit` read `apps/api/.env`. A
  `DATABASE_URL` given on the command line wins — `dotenv` never overrides an existing
  environment variable.
- `db:seed` boots `apps/api/src/env.ts`. Keep `AUTH_MODE=test` in your local `apps/api/.env`
  (the `.env.example` default) so the seed does not demand Firebase/R2/OpenRouter credentials;
  it only writes rows.
- The seed is idempotent: it skips when a `challenges` row already exists.

## 4. Promote the first admin

`users.role` is a Postgres enum `role` (`'member' | 'admin'`) and `users.status` is
`user_status` (`'pending' | 'active' | 'disabled'`); new rows default to `member` / `pending`.
Roles are only editable through the admin API, so the first admin is promoted by hand.

Sign in once from the iOS app or the admin dashboard to create the row, then run against the
production database (Railway → Postgres service → *Data* tab, or `psql "<production url>"`):

```sql
-- find your row: it is the newest one, and display_name is the name you signed in with
SELECT id, firebase_uid, display_name, role, status, created_at FROM users ORDER BY created_at DESC;

-- promote it
UPDATE users SET role = 'admin', status = 'active' WHERE firebase_uid = '<your firebase uid>';
```

Until this runs, the dashboard shows `/not-authorized` and the app account stays `pending`.

## 5. Domain

API service → *Settings → Networking* → **Generate Domain** (Railway gives
`*.up.railway.app`), or **Custom Domain** and add the CNAME it prints at your DNS provider.
Railway routes the domain to the port it injected as `PORT`; nothing to configure in the app.

Verify:

```bash
curl -fsS https://<api-domain>/health      # -> {"ok":true}
```

Then hand that domain to:

- `NEXT_PUBLIC_API_BASE_URL` on Vercel (no trailing slash),
- `API_BASE_URL` under `settings.configs.Release` in `ios/project.yml` (today the placeholder
  `https://skinny-legend-api.up.railway.app`), then regenerate the Xcode project.

## 6. The two cron services

For each of `cleanup` and `notify`: **New** → **GitHub Repo** → same repository → then set the
service's *Build* and *Deploy* fields to its column of the table above (start command, cron
schedule, restart policy **Never**, no health check), and copy the API's variables across (the
jobs use the same `env.ts`). Do **not** generate a domain for them; with a cron schedule and
restart policy *Never*, Railway runs the container to completion on schedule.

- `cleanup` — `0 3 * * 1`, Mondays 03:00 UTC. Deletes R2 objects older than 24 h that no
  `entries.photo_key` / `entries.thumb_key` / `users.avatar_key` / `feedback.screenshot_key`
  row references.
- `notify` — `0 13 * * *`, 13:00 UTC = 20:00 Asia/Ho_Chi_Minh year-round (ICT has no DST).
  Needs Firebase plus an APNs key uploaded to Firebase Cloud Messaging before real sends work
  (`docs/deploy/firebase.md`, SKI-40/42).

Create `notify` only once Firebase is configured: with `AUTH_MODE` unset it refuses to boot
until the three `FIREBASE_*` vars are present.
