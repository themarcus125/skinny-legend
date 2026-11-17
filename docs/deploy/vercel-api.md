# Vercel + Neon — API, Postgres and the cleanup cron (SKI-136)

The Hono API in `apps/api` runs as one Vercel function on the `skinny-legend-api` project
(team `themarcus125s-projects`, Hobby, project id `prj_RmCGDD69U0EMBJtIAJ7fkXGh5Ycg`), backed
by a Neon Postgres database. The weekly R2 cleanup is a Vercel cron that calls
`GET /cron/cleanup` on the same function.

| Piece | Where | Shape |
| --- | --- | --- |
| API | Vercel function, region `sin1` | Serves the default export of `dist/app.js`; health check `/health` |
| Database | Neon, `aws-ap-southeast-1` | Pooled URL for the API, direct URL for migrations and the data copy |
| `cleanup` | Vercel cron | `GET /cron/cleanup` at `0 3 * * 1`, guarded by `CRON_SECRET` |
| `notify` | **not wired** | See §8 |

Framework, install, build, output directory, region and cron all live in
`apps/api/vercel.json`, so they are reviewed in pull requests rather than set by hand.

**Status.** The live clients moved here at the 2026-11-17 cutover, in one sitting: the Railway
`api` was paused, §5 copied Railway's Postgres into Neon (all 14 tables matched on row count),
`CRON_SECRET` was added on Vercel as Railway's `cleanup` was removed (§7), and the admin and PWA
were switched to Vercel (§10). The Railway project is paused as a rollback for about a week,
pending deletion. A final Railway dump taken at cutover is kept offline as a restore source
(§5). Before a restore or a rollback to Railway, remove `CRON_SECRET` first (§7); restoring the
cutover dump also drops every write since 2026-11-17. `apps/api/Dockerfile` and `src/index.ts`
(the `@hono/node-server` entry that `pnpm dev`/`start` and the e2e suite run) stay in the repo.

## 1. Neon

The project already exists: **`skinny-legend`**, id `empty-thunder-13073740`, Free plan,
Postgres 18, region `aws-ap-southeast-1` (Singapore, next to Vercel's `sin1`), database
`neondb`, role `neondb_owner`. To create it again from scratch:

1. console.neon.tech → **New project** → name `skinny-legend`, Postgres **18**, region
   **AWS Asia Pacific 1 (Singapore)** (`aws-ap-southeast-1`). Free plan.
2. Keep the default database `neondb` and role `neondb_owner`.
3. Project → **Connect** shows two connection strings. Note both:
   - the **pooled** URL: its host has `-pooler` in it (`ep-…-pooler.ap-southeast-1.aws.neon.tech`).
     It goes through Neon's PgBouncer in transaction mode. The API uses this one (§3).
   - the **direct** URL: the same host without `-pooler`. Migrations, the seed and the data copy
     use this one (§4, §5), because they need a real session.

Neon prints the URLs with `?sslmode=require&channel_binding=require`. Keep `?sslmode=require`,
but **delete `&channel_binding=require`** from every URL you hand to this repo's code
(`DATABASE_URL` on Vercel, and for `db:migrate` / `db:seed`): postgres.js forwards unknown URL
parameters to the server as startup parameters (`parseOptions` in `postgres/src/index.js`), and
the server rejects that one. The libpq tools in §5 (`pg_dump`, `psql`) understand
it, so it can stay there.

`apps/api/src/db.ts` opens the pool with `prepare: false`, so no query depends on a prepared
statement surviving across the pooler's transactions.

Neon Free scales the compute to zero after 5 minutes idle (fixed on Free). The first query after
that wakes it, which adds latency; §9 has the check that this does not also break the API's
pooled connections.

## 2. Vercel project settings

`skinny-legend-api` → *Settings*:

| Setting | Value |
| --- | --- |
| Build and Deployment → **Root Directory** | **`apps/api`** |
| Include files outside the Root Directory in the Build Step | **enabled** (the pnpm lockfile, `pnpm-workspace.yaml` and `packages/shared` live outside `apps/api`) |
| Node.js Version | **22.x** (matches `node:22-alpine` in the Dockerfile) |
| Framework Preset, Install, Build and Output commands | leave the dashboard defaults: `apps/api/vercel.json` overrides them |

What `apps/api/vercel.json` sets:

- `framework: "hono"`. The preset matters: "Other" would serve `dist/` as static files.
- `installCommand: "pnpm install --frozen-lockfile"`, as in the Dockerfile and the admin project.
- `buildCommand`: builds `@skinny/shared` (its exports point at `dist/`), then `@skinny/api`
  (`tsc` to `apps/api/dist`, the same output the Docker image runs).
- `outputDirectory: "dist"`. Vercel's Hono builder looks there for the entrypoint and picks
  `dist/app.js`, whose default export is the app. `dist/index.js` (the node-server entry) is not
  picked, and nothing in `dist/` is served as a static file.
- `regions: ["sin1"]`, next to Neon's Singapore region.
- `crons`: `/cron/cleanup` at `0 3 * * 1` (§7).

There is no `functions` block: the default Fluid duration on Hobby (300 s) covers the 12 s vision
timeout and the sweep.

## 3. Environment variables (Production)

*Settings → Environment Variables*, environment **Production**. Every variable below comes from
`apps/api/src/env.ts`; `.env.example` at the repo root has the same shape. A change takes effect
on the next deployment: redeploy after editing (`vercel redeploy <production url>` or
*Deployments → Redeploy*).

| Variable | Required? | Where the value comes from |
| --- | --- | --- |
| `DATABASE_URL` | yes | The Neon **pooled** URL (`-pooler` host), with `?sslmode=require` and **without** `&channel_binding=require` (§1). Must parse as a URL. |
| `FIREBASE_PROJECT_ID` | yes | Firebase service-account JSON, field `project_id` (see `docs/deploy/firebase.md`). |
| `FIREBASE_CLIENT_EMAIL` | yes | Same JSON, field `client_email`. |
| `FIREBASE_PRIVATE_KEY` | yes | Same JSON, field `private_key`, pasted **with literal `\n`** (see firebase.md). |
| `R2_ACCOUNT_ID` | yes | Cloudflare dashboard → R2 → Account ID (see `docs/deploy/r2.md`). |
| `R2_ACCESS_KEY_ID` | yes | R2 API token, Access Key ID. |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API token, Secret Access Key (shown once). |
| `R2_BUCKET` | no | Defaults to `skinny-legend`. Set it only if you named the bucket differently. |
| `OPENROUTER_API_KEY` | yes | openrouter.ai → Keys. |
| `VISION_MODEL` | no | Defaults to `qwen/qwen3.7-flash`. Override to swap models with a redeploy, no code change. |
| `AUTH_MODE` | **leave unset** | Defaults to `firebase`. The API throws on boot if it is `test` while `NODE_ENV=production`. |
| `CORS_ORIGINS` | yes in practice | Comma-separated browser origins, scheme + host only, no trailing slash: the admin on Vercel and the PWA on Cloudflare Pages, e.g. `https://skinny-legend-admin.vercel.app,https://skinny-legend.pages.dev`. Defaults to `http://localhost:3001`, which covers neither. See `docs/deploy/admin-vercel.md` and `docs/deploy/web-pages.md`. |
| `CRON_SECRET` | yes | `openssl rand -hex 32`. Vercel Cron sends it as `Authorization: Bearer <secret>`. While it is unset, `/cron/cleanup` answers 401 to everyone. |

`PORT` is not used on Vercel: the function has no listener of its own.

How the gates work (`apps/api/src/env.ts`): with `AUTH_MODE=firebase` the three `FIREBASE_*`
vars must be non-empty; with any mode other than `test` the four "service" vars
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `OPENROUTER_API_KEY`) must be
non-empty too. A missing one fails the boot with a message naming it, so a bad deploy is loud,
not silent. `CRON_SECRET` is not one of the gates, so the API boots without it.

## 4. Migrate and seed (fresh install only)

**Skip this section when §5's copy will run.** The dump brings the schema and drizzle's
migration table with it, and its restore drops and recreates them.

The deployed function ships only the production build, so `drizzle-kit` is not in it. Run both
from a local checkout with Neon's **direct** URL (no `-pooler`, no `channel_binding`) exported:

```bash
pnpm install
pnpm --filter @skinny/shared build          # api/seed import @skinny/shared from dist/
DATABASE_URL='<neon direct url>' pnpm --filter @skinny/api db:migrate
DATABASE_URL='<neon direct url>' AUTH_MODE=test pnpm --filter @skinny/api db:seed
```

Notes:

- Both commands run from `apps/api`, so `dotenv` and `drizzle-kit` (`drizzle.config.ts`) read
  `DATABASE_URL`. A value given on the command line wins: `dotenv` never overrides an existing
  environment variable.
- `db:seed` boots `apps/api/src/env.ts`. `AUTH_MODE=test` keeps it from demanding
  Firebase/R2/OpenRouter credentials; it only writes rows.
- The seed is idempotent: it skips when a `challenges` row already exists.

## 5. Data copy or restore into Neon

1. **Switch the cleanup cron off** when `DST` is the live database: remove `CRON_SECRET` and
   redeploy, as §7 says.
2. **Stop writes** to the source database, or accept that anything written after the dump is
   lost.
3. **Export the two URLs without printing them.** `SRC` is the source's public URL (a host
   internal to the source's platform does not resolve from your machine). `DST` is Neon's
   **direct** URL.

   ```bash
   read -rs SRC && export SRC   # paste, Enter; nothing is echoed
   read -rs DST && export DST
   ```

4. **Dump and restore** with the Postgres 18 client tools from the official image. `-e SRC
   -e DST` passes the values into the container without putting them on the command line:

   ```bash
   docker run --rm -e SRC -e DST postgres:18 sh -c 'pg_dump --format=custom --no-owner --no-privileges --file=/tmp/db.dump "$SRC" && pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname="$DST" /tmp/db.dump'
   ```

   To restore a dump file kept offline instead, export only `DST` and mount the file:

   ```bash
   docker run --rm -e DST -v "$PWD/railway-final.dump:/tmp/db.dump:ro" postgres:18 sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname="$DST" /tmp/db.dump'
   ```

   - The dump goes to a file first, so `pg_restore` only runs on a dump that `pg_dump` finished.
   - `--clean --if-exists`: drops each object before recreating it, so the command can run again
     over an earlier copy (or a §4 run by mistake). `DST` does not
     need to be empty.
   - `--single-transaction --exit-on-error`: the first failure rolls the whole restore back, the
     drops included, so `DST` is either the old copy or the new one, never half of each.
   - `--no-owner --no-privileges`: the source's roles do not exist on Neon; everything ends up
     owned by `neondb_owner`.
   - The dump includes the `drizzle` schema, so `drizzle.__drizzle_migrations` comes across.

5. **Check the copy.**

   ```bash
   docker run --rm -e SRC -e DST postgres:18 sh -c '
     q="select (select count(*) from users), (select count(*) from entries), (select count(*) from drizzle.__drizzle_migrations)"
     psql "$SRC" -Atc "$q"; psql "$DST" -Atc "$q"'
   DATABASE_URL="$DST" pnpm --filter @skinny/api db:migrate   # must apply nothing
   ```

   The two `psql` lines must be identical. If `DST` still carries `&channel_binding=require`,
   drop it for the `db:migrate` call (§1).

6. **Switch the cleanup cron back on** (§7) only once Neon is the database the clients write to.

## 6. Promote the first admin

Only needed on a fresh install (§4). After a data copy (§5) the admins come across with the
`users` table.

`users.role` is a Postgres enum `role` (`'member' | 'admin'`) and `users.status` is
`user_status` (`'pending' | 'active' | 'disabled'`). A first sign-in creates the row as
`member` / `active`, so there is no approval step for new members. Roles are only editable
through the admin API, so the first admin is promoted by hand.

Sign in once from the iOS app or the admin dashboard to create the row, then run against the
Neon database (Neon console → *SQL Editor*, or `psql "<neon direct url>"`):

```sql
-- find your row: it is the newest one, and display_name is the name you signed in with
SELECT id, firebase_uid, display_name, role, status, created_at FROM users ORDER BY created_at DESC;

-- promote it
UPDATE users SET role = 'admin' WHERE firebase_uid = '<your firebase uid>';
```

Until this runs, the dashboard shows `/not-authorized`.

## 7. Cron: `/cron/cleanup`

- `apps/api/vercel.json` declares `/cron/cleanup` at `0 3 * * 1`: Mondays 03:00 **UTC**. On
  Hobby, Vercel fires it some time within that hour, runs crons only on the production
  deployment, does not retry a failure, and can occasionally fire twice. Twice is safe here: the
  second sweep finds nothing to delete.
- The route deletes R2 objects older than 24 h that no `entries.photo_key` /
  `entries.thumb_key` / `users.avatar_key` / `feedback.screenshot_key` row references
  (`apps/api/src/jobs/cleanup.ts`), and answers `{"deleted":n}`.
- It answers **401** to any request whose `Authorization` header is not exactly
  `Bearer <CRON_SECRET>`, and to everyone while `CRON_SECRET` is unset. It is set on Production
  (§3).
- **Only one cleanup may sweep the shared R2 bucket: the one whose database is live.** A sweep
  against a stale database deletes photos the live one still references. Before a §5 copy or
  restore over the live database, or a rollback to another API, remove `CRON_SECRET` and
  redeploy (the cron then answers 401); add it back and redeploy only once the restored
  database is the one the clients write to.
- Manual run:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://skinny-legend-api.vercel.app/cron/cleanup
  # -> {"deleted":n}
  ```

## 8. Notify (not wired)

The daily reminder job (`apps/api/src/jobs/notify.ts`; it was never deployed on Railway either) has no Vercel
route yet. To add it:

1. a `GET /cron/notify` route in `apps/api/src/routes/cron.ts` that calls `runNotifyJob` behind
   the same `CRON_SECRET` guard as `/cleanup`;
2. a cron entry in `apps/api/vercel.json`:
   `{ "path": "/cron/notify", "schedule": "0 13 * * *" }` (13:00 UTC = 20:00
   Asia/Ho_Chi_Minh; ICT has no DST).

Hobby allows a cron to run at most once a day, which this schedule fits, but fires it some time
within the hour, so reminders would land between 20:00 and 20:59. It needs Firebase plus an APNs
key uploaded to Firebase Cloud Messaging before real sends work (`docs/deploy/firebase.md`).

## 9. Verify (after a deploy)

```bash
curl -fsS https://skinny-legend-api.vercel.app/health                                 # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://skinny-legend-api.vercel.app/me      # 401
curl -s -o /dev/null -w '%{http_code}\n' https://skinny-legend-api.vercel.app/cron/cleanup   # 401
```

**Idle check** (Neon Free scales to zero after 5 minutes, fixed). After more than 10 minutes with
no traffic, call an authenticated route that reads the database (for example `GET /me` with a
real token) **twice in a row**. Both must succeed, and `vercel logs` for the deployment must show
no 500 and no `ECONNRESET`. A failure means the function kept postgres.js sockets the suspended
compute had closed. Fix it with a postgres.js `idle_timeout` below the 5-minute
suspend window, or a retry-once.

## 10. Client base URLs

The clients use `https://skinny-legend-api.vercel.app` (Production and Preview). Where each base
URL lives:

- `NEXT_PUBLIC_API_BASE_URL` on the Vercel admin project `skinny-legend-admin` (no trailing slash),
  then redeploy that project (the value is baked in at build time);
- `VITE_API_BASE_URL` on the Cloudflare Pages project (`skinny-legend.pages.dev`), then redeploy
  that project (the value is baked in at build time);
- `API_BASE_URL` under `settings.configs.Release` in `ios/project.yml` (already set), then
  regenerate the Xcode project.
