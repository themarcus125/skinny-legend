# Operation Skinny Legend — Local end-to-end suite design

Date: 2026-09-15. Status: approved in chat, section by section, on 2026-09-15.

## 1. Purpose and decisions

A single Playwright suite that exercises the product the way the friend group uses it: the web PWA and the admin talking to the real API, the real Postgres, and the real third-party services, on one developer machine and in CI.

| Decision | Choice |
|---|---|
| Shape | One root-level suite (`e2e/`, package `@skinny/e2e`) driving both UIs against one stack; a thin support package for DB and emulator helpers |
| Third-party services | Everything real: Cloudflare R2, OpenRouter vision, Nominatim places. No stand-ins |
| Sign-in | Firebase Auth Emulator; real Firebase SDK flow with email/password users the suite creates |
| Database | A dedicated `skinny_e2e` database on the existing docker-compose Postgres; the dev database is never touched |
| Push | The API's fake sender (no FCM emulator exists); delivery is out of scope |
| Parallelism | One Playwright worker; spec files run serially |
| Out of scope | Push delivery, offline mode, the iOS app |

## 2. Stack and orchestration

`pnpm e2e` at the repo root runs Playwright in `e2e/`. Its global setup:

1. Preflight: Docker reachable; `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY` present in the root `.env` (or the shell); ports 3100–3102 and 9099 free unless `E2E_REUSE=1`. Each failure is one line naming the fix.
2. `docker compose up -d db auth-emulator`. `auth-emulator` is a new compose service: an image with Java 17 and `firebase-tools`, running `firebase emulators:start --only auth --project skinny-legend`, port 9099, health-checked on `GET /` of the emulator. The suite waits for both services.
3. Creates `skinny_e2e` if missing, runs the Drizzle migrations from `apps/api/drizzle/` against it, runs `apps/api/src/seed.ts` (idempotent: one challenge plus scoring rules).
4. Starts the API on port 3100: `AUTH_MODE=firebase`, `FIREBASE_PROJECT_ID=skinny-legend`, `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`, `DATABASE_URL` for `skinny_e2e`, real `R2_*` and `OPENROUTER_API_KEY`, `STORAGE_KEY_PREFIX=e2e/`, `CORS_ORIGINS=http://localhost:3101,http://localhost:3102`.
5. Builds and starts the admin (`next build` then `next start -p 3101`) with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3100`, the Firebase public config, and `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`; builds and starts the web app (`vite build` then `vite preview --port 3102`) with the `VITE_*` equivalents. Builds are skipped when `E2E_REUSE=1` and the ports already answer.

Global teardown stops the three app processes, deletes the R2 objects the run uploaded (see §3), and leaves the containers running. `pnpm e2e:down` removes them.

Product-code changes required:

- `apps/api/src/env.ts`: when `FIREBASE_AUTH_EMULATOR_HOST` is set, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are optional and `firebase.ts` initialises the admin SDK with only the project id; `push.ts` uses `fakeSender()` in that case. Refusing to boot with the emulator host set in `NODE_ENV=production` mirrors the existing test-mode guard. New `STORAGE_KEY_PREFIX` (default empty) prefixes every presigned object key.
- `apps/admin/src/lib/auth/firebase.ts` and `apps/web/src/auth/firebase.ts`: call `connectAuthEmulator(auth, 'http://' + host, { disableWarnings: true })` when the emulator host variable is present.
- Both sign-in screens render an email/password form only when the emulator host variable is present at build time; Google stays the only production path. Copy is Vietnamese with English translations, under the existing i18n lint.

## 3. Test data, isolation and users

`packages/e2e-support` (`@skinny/e2e-support`, Node only) exports:

- `resetDatabase(databaseUrl)`: deletes rows from `place_cache`, `audit_log`, `notification_log`, `device_tokens`, `feedback`, `ai_verdicts`, `entry_categories`, `entries`, `users`, in that order; challenges and scoring rules stay.
- `clearEmulatorUsers(projectId)`: `DELETE /emulator/v1/projects/{projectId}/accounts`.
- `createMember({ name, email, password, status, role, locale })`: creates the account through the emulator's Identity Toolkit REST API (`accounts:signUp`), then inserts the `users` row with `firebaseUid` = the returned `localId` and the requested status (default `active`), role (default `member`) and locale (default `vi`). Returns `{ uid, email, password, name }`.
- `signInWeb(page, member)` and `signInAdmin(page, member)`: open the sign-in screen, fill the emulator form, wait for the post-sign-in route.
- `trackR2Key(key)` and `cleanupR2()`: the setup records every object key the run creates (from the API's presign responses captured through the page's network events, plus a listing of the `e2e/` prefix at teardown) and deletes them with the S3 client.

Isolation: every spec file calls `resetDatabase()` and `clearEmulatorUsers()` in `beforeAll`. Fixtures in `e2e/fixtures/`: three JPEGs with real EXIF (`takenAt` and GPS in Ho Chi Minh City) and one without EXIF.

Real-service assertions are tolerant by design: uploads assert a `GET` of the presigned URL returns 200 with the right content type; verdict assertions check an `ai_verdicts` row exists with a valid shape and the entry is `confirmed` or `pending` with `failed: true`, never a specific category; places assert either a chip with a non-empty name or the manual fallback.

## 4. Flows

| Spec | Actor(s) | Covers |
|---|---|---|
| `onboarding.spec.ts` | member, admin | pending screen → admin approves → overview; admin disables → disabled screen |
| `track.spec.ts` | member | photo upload with progress, verdict sheet, checklist and points, "Không đúng?" correction recalculates points, R2 object fetchable |
| `admin-entries.spec.ts` | member, admin | entry appears with the AI verdict in the admin list; reject; member history shows the rejection and points drop |
| `leaderboard.spec.ts` | three members | ranks, weekly delta, member detail paging, trends bars match `GET /leaderboard` and `GET /trends` |
| `feed.spec.ts` | two members | day grouping, map pins from EXIF locations, real Nominatim place chip on track |
| `account.spec.ts` | member, admin | name and avatar edit (avatar in R2), language switch updates `users.locale` visible in the admin, entry deletion, sign-out clears the session |
| `admin-ops.spec.ts` | admin, member | members list and role change, notification test send logs a web-platform row, audit log rows per action, feedback list |
| `api.spec.ts` | request client | 401 on a bad token, 403 for a pending member, 400 validation errors, CORS headers for the two UI origins |

## 5. Error handling, reporting and CI

- Preflight failures and service boot failures are one line each with the fix; no Playwright tests start.
- OpenRouter timeout or failure → `failed: true` path, accepted by the track spec. R2 PUT failure → the spec fails with the presign URL and status. Nominatim rate limit → manual fallback, accepted.
- One retry per test (`retries: 1`); trace, screenshot and video on first retry under `e2e/test-results/`; API, admin and web stdout/stderr under `e2e/logs/`.
- `.github/workflows/e2e.yml`: on pull requests to `main`, Postgres 16 service plus the emulator container, secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`; 20-minute timeout; `continue-on-error: true` until the secrets exist, then required.
- `docs/testing/e2e.md`: prerequisites (Docker, the keys), `pnpm e2e`, `E2E_REUSE=1`, headed runs, running one spec, adding a flow, reading artifacts.

## 6. Cost and limits

Each full run makes roughly a dozen OpenRouter calls and uploads about ten small objects to R2, both well under a cent at current prices. Nominatim is called at most a few times per run under the API's one-request-per-second limiter; the `place_cache` table absorbs repeats within a run.
