# End-to-end suite

One Playwright suite drives the member web app and the admin console against the real API, a
dedicated Postgres database, the Firebase Auth Emulator, and the real R2, OpenRouter and
Nominatim services. Design: [`docs/superpowers/specs/2026-09-15-local-e2e-design.md`](../superpowers/specs/2026-09-15-local-e2e-design.md).

## Prerequisites

- Docker Desktop running (Postgres and the Auth Emulator are containers).
- These keys in the repo-root `.env`, or exported in your shell:
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`.
- Ports 3100 (API), 3101 (admin), 3102 (web) free; 9099 is the emulator's.
- `pnpm --filter @skinny/e2e exec playwright install chromium`, once.

Preflight checks Docker, the five keys and the three app ports before anything is built, and
prints one line per failure naming the fix.

## Running

```bash
pnpm e2e                          # the whole suite
pnpm --filter @skinny/e2e e2e specs/api.spec.ts   # one spec
pnpm e2e:headed                   # watch the browser
E2E_REUSE=1 pnpm e2e              # reuse the already-running stack, skip the builds
pnpm e2e:down                     # remove the db and auth-emulator containers
```

The first run builds the API, the admin and the web app; later runs with `E2E_REUSE=1` skip that.
Teardown stops the three app processes, sweeps the run's R2 objects under `e2e/`, and leaves the
containers up.

`E2E_REUSE=1` adopts a running stack only after each service answers as itself — the API's
`GET /health` returning `{"ok":true}`, the admin page carrying its `Skinny Legend Admin` marker,
and the web app's `<title>Skinny Legend</title>`. Those checks cannot see the adopted API's
`DATABASE_URL`: an API left running against the dev database `skinny` passes them and the suite
will then read and write dev data. Only reuse a stack this suite started.

`scripts/check-emulator.mjs` is a standalone emulator probe that **deletes every account in the
emulator**. Never run it while a suite is running or against an emulator whose accounts matter.

## Data and isolation

- The database is `skinny_e2e` on the same Postgres as dev. The dev database `skinny` is never
  touched.
- Every spec calls `resetAll()` in `beforeAll`: the per-run tables are emptied and the emulator's
  accounts are deleted. The seeded challenge and scoring rules survive.
- Every object key the API creates starts with `e2e/` (`STORAGE_KEY_PREFIX`), which is what the
  teardown sweep deletes. That sweep removes **everything** under the prefix, so only one run may
  use a given bucket at a time: CI queues its runs on a `concurrency` group, and locally you must
  not start a second run (or share the bucket with a colleague's) while one is in flight.
- The photo fixtures are generated, not committed. Global setup writes `e2e/.fixtures/` (gitignored)
  with the EXIF `DateTimeOriginal` set to 00:05 today in Asia/Ho_Chi_Minh — the zone the Playwright
  project is pinned to — so the entries the suite creates always land on today's `localDate`. Set
  `E2E_FIXTURE_DATE=YYYY-MM-DD` to date them elsewhere; the specs read the same value, so a day
  heading still matches and the dashboard's Today-card assertions stand down.
- Members are created by `member({ name, email, status, role, locale })` from
  `e2e/src/helpers.ts`, which makes the emulator account and the `users` row in one call.

## The specs

| Spec | Flow |
| --- | --- |
| `specs/onboarding.spec.ts` | Pending screen → admin approves → overview; admin disables → disabled screen |
| `specs/track.spec.ts` | Photo upload, verdict sheet, checklist and points, correction recalculates, the R2 object is fetchable |
| `specs/admin-entries.spec.ts` | The entry in the admin list with its AI verdict; reject; the member's history and points |
| `specs/leaderboard.spec.ts` | Ranks, weekly delta, member detail paging, trend bars against `GET /leaderboard` and `GET /trends` |
| `specs/feed.spec.ts` | Day grouping, map pins from EXIF, the real Nominatim place chip |
| `specs/account.spec.ts` | Name and avatar edit, language switch, entry deletion, sign-out |
| `specs/admin-ops.spec.ts` | Members list and role change, notification test send and its log row, audit log, feedback |
| `specs/api.spec.ts` | The API contract: 401s, 403s, `invalid_body`, CORS for the two UI origins |

They run serially on one worker, in one Chromium project, sharing one database and one emulator.

## Adding a flow

1. Create `e2e/specs/<flow>.spec.ts`, `test.describe.configure({ mode: 'serial' })` at the top.
2. `await resetAll()` in `beforeAll`, then create the members the flow needs.
3. Sign in with `signInWeb(page, m)` or `signInAdmin(page, m)`.
4. Prefer existing `data-testid` selectors; if you need a new one, add it to the product
   component in the same commit and keep the app's own unit tests green.
5. Real services are allowed to disagree: assert shapes and states, never a particular AI
   category or place name.

## Artifacts

- `e2e/logs/{api,admin,web}.log` — each service's stdout and stderr, and its build output.
  Teardown redacts them before they can be uploaded: presigned-URL `X-Amz-*` query parameters and
  `Authorization:` header values are replaced with `REDACTED`.
- `e2e/test-results/` — screenshots of every failure; traces and videos from the first retry.
- `e2e/playwright-report/` — the HTML report (`pnpm --filter @skinny/e2e exec playwright show-report`).

## CI

[`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml) runs on pull requests to `main`
with a Postgres 16 service container and the Auth Emulator built from `infra/firebase-emulator`,
and uploads the artifacts above. Global setup skips `docker compose up` when `CI=true`, because
the workflow provides both containers itself.

It is `continue-on-error: true` until the five repository secrets — `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY` — exist; make the
job required once they do. Until then the workflow has never run green, so treat it as untested.
