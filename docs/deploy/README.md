# Deploy runbooks (SKI-37)

Four providers, one order. Each step below links to the runbook that has the clicks. The API has
run on Vercel + Neon since the 2026-11-17 cutover; the old Railway project is paused pending
deletion.

| # | Step | Runbook | Blocked by |
| --- | --- | --- | --- |
| 1 | Cloudflare R2 bucket, scoped API token, CORS | [`r2.md`](./r2.md) | — |
| 2 | OpenRouter API key | (no runbook: openrouter.ai → Keys → create) | — |
| 3 | Firebase project, Google provider, service account, web app config | [`firebase.md`](./firebase.md) | — |
| 4 | Neon database, Vercel API project `skinny-legend-api`, env vars, migrate + seed (or the §5 data copy / restore) | [`vercel-api.md`](./vercel-api.md) §1–§5 | 1–3 (the API will not boot without R2, OpenRouter and Firebase vars) |
| 5 | Vercel admin project, env vars, `CORS_ORIGINS` back on the Vercel API project | [`admin-vercel.md`](./admin-vercel.md), [`vercel-api.md`](./vercel-api.md) §3 | 3, 4 |
| 6 | Firebase authorized domains for the Vercel domain | [`firebase.md`](./firebase.md) §6 | 5 |
| 6b | Cloudflare Pages project for the member PWA, env vars, `CORS_ORIGINS` and Firebase authorized domains for the Pages domain | [`web-pages.md`](./web-pages.md) | 3, 4 |
| 7 | Promote the first admin (SQL on Neon) | [`vercel-api.md`](./vercel-api.md) §6 | 5, 6, plus one sign-in from the dashboard |
| 8 | `cleanup` Vercel cron (`0 3 * * 1`), switched on with `CRON_SECRET` | [`vercel-api.md`](./vercel-api.md) §7 | 4 (and, after a data copy, §5 first) |
| 9 | Apple: Sign in with Apple key + APNs key, uploaded to Firebase | [`firebase.md`](./firebase.md) §3, §5 | **SKI-42** (paid Apple Developer account) |
| 10 | `notify` Vercel cron (`0 13 * * *`), not wired yet | [`vercel-api.md`](./vercel-api.md) §8 | 4, 9 — sends fail without the `FIREBASE_*` vars and the APNs key |
| 11 | iOS release wiring: `GoogleService-Info.plist`, `GOOGLE_REVERSED_CLIENT_ID`, Release `API_BASE_URL`, `DEVELOPMENT_TEAM`, `aps-environment: production` | [`firebase.md`](./firebase.md) §2 and README "Before TestFlight" | 3, 4, SKI-42 |

`apps/api/vercel.json` holds the API's framework, build, region and cron.

## What to hand back

Non-secret values, needed to finish the wiring in this repo and in the other dashboards. Paste
these anywhere:

| Value | Where you get it | What it feeds |
| --- | --- | --- |
| **API domain** (`https://skinny-legend-api.vercel.app`) | Vercel → `skinny-legend-api` → Domains | `NEXT_PUBLIC_API_BASE_URL` on the admin project; `VITE_API_BASE_URL` on Cloudflare Pages; Release `API_BASE_URL` in `ios/project.yml` |
| **Admin domain** (e.g. `https://skinny-legend-admin.vercel.app`) | Vercel project `skinny-legend-admin` | `CORS_ORIGINS` on the Vercel API project; Firebase authorized domains |
| **Web PWA domain** (e.g. `https://skinny-legend.pages.dev`) | Cloudflare Pages project | `CORS_ORIGINS` on the Vercel API project; Firebase authorized domains |
| **Web Push certificate** ("Key pair") | Firebase → Project settings → Cloud Messaging → Web Push certificates | `VITE_FIREBASE_VAPID_KEY` on Cloudflare Pages |
| **Firebase project id** | Firebase → Project settings | `FIREBASE_PROJECT_ID` (Vercel API project) + `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (Vercel admin project) — must match |
| **Firebase web config**: `apiKey`, `authDomain`, `projectId`, `appId` | Firebase → Project settings → Your apps → Web app | the four `NEXT_PUBLIC_FIREBASE_*` vars |
| **`REVERSED_CLIENT_ID`** | inside the downloaded `GoogleService-Info.plist` | `GOOGLE_REVERSED_CLIENT_ID` in `ios/project.yml` |
| **R2 account id** | Cloudflare → R2 → Account ID | `R2_ACCOUNT_ID` (it is also the S3 endpoint host) |
| **R2 bucket name** | you chose it | `R2_BUCKET` — only if it is not `skinny-legend` |
| **Bundle id** | already `com.themarcus125.skinnylegend` | Firebase iOS app registration, Apple App ID |
| **Apple Team ID** (SKI-42) | Apple Developer → Membership | `DEVELOPMENT_TEAM` in `ios/project.yml`, Firebase Apple provider, APNs key upload |

## Where secrets go

Straight from the provider's page into the hosting provider's variable UI. **Never** into this
repo, a commit, a screenshot, or a chat message. If one is pasted somewhere it should not be,
rotate it at the provider rather than deleting the message.

| Secret | Lives in |
| --- | --- |
| `DATABASE_URL` | Vercel API project env (Production): the Neon **pooled** URL, without `&channel_binding=require` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Vercel API project env |
| `OPENROUTER_API_KEY` | Vercel API project env |
| `FIREBASE_PRIVATE_KEY` (+ the rest of the service-account JSON) | Vercel API project env, one line with literal `\n` |
| `CRON_SECRET` | Vercel API project env (Production), set since 2026-11-17 (`openssl rand -hex 32`) |
| APNs `.p8`, Sign in with Apple `.p8` | uploaded to Firebase / Apple only; keep the downloads in a password manager |
| `GoogleService-Info.plist` | on disk at `ios/SkinnyLegend/` only — gitignored, never committed |

The Vercel **admin** project holds no secrets: every admin variable is `NEXT_PUBLIC_*` and is
inlined into the public bundle by design.

## Smoke tests, in order

```bash
curl -fsS https://<api-domain>/health          # {"ok":true}
```

Then: sign in on the dashboard (expect `/not-authorized`) → run the promotion SQL → reload
(members and entries load) → sign in on the app → submit one entry (exercises presign + PUT to
R2 + OpenRouter + thumbnail) → confirm the photo renders in the dashboard.
