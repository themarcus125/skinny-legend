# Vercel — admin dashboard (`apps/admin`)

Next.js 16 App Router, Tailwind v4, TanStack Query, Firebase Google sign-in. It is a pure
client of the Railway API: no server secrets, no database, no `@skinny/shared` dependency
(deliberately — that package resolves from `dist/`, and depending on it would force a
cross-package build into the Vercel build).

## 1. Create the project

Vercel → **Add New → Project** → import this repository, then:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| **Root Directory** | **`apps/admin`** |
| Include source files outside of the Root Directory | **enabled** (the pnpm lockfile lives at the repo root) |
| Install Command | `pnpm install --frozen-lockfile` (Vercel runs it from the workspace root) |
| Build Command | default (`next build`) |
| Output Directory | default |
| Node.js Version | 22.x |

pnpm is detected from the root `pnpm-lock.yaml` and `packageManager: pnpm@10.30.3`. No
`vercel.json` is needed. If a build ever fails on a missing root lockfile, add
`apps/admin/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @skinny/admin build"
}
```

## 2. Environment variables (Production **and** Preview)

Every variable is `NEXT_PUBLIC_*`, i.e. inlined into the client bundle — none is a secret.
Sources: `apps/admin/.env.example`, `apps/admin/src/lib/auth/firebase.ts`.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | The Railway API domain, **no trailing slash** (e.g. `https://skinny-legend-api.up.railway.app`) |
| `NEXT_PUBLIC_MOCK` | `0` — **never** `1` in a deployed environment (`1` swaps in `MockAdminApi` and skips Firebase entirely) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase → Project settings → Your apps → Web app (`apiKey`) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same config (`authDomain`, e.g. `skinny-legend.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same config (`projectId`) — must equal the API's `FIREBASE_PROJECT_ID` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same config (`appId`) |

All four Firebase values must be present together; `isFirebaseConfigured()` returns false if any
is missing and sign-in throws "Thiếu biến môi trường NEXT_PUBLIC_FIREBASE_*".

## 3. On the API side (Railway) — CORS

The dashboard is a different origin from the API, so the API must be told to allow it. On the
Railway `api` service, set:

| Variable | Value |
| --- | --- |
| `CORS_ORIGINS` | Comma-separated origins, **scheme and host only, no trailing slash, no path** — e.g. `https://skinny-legend-admin.vercel.app,http://localhost:3001` |

Add each preview domain you actually use as an extra comma-separated entry. Redeploy the API
after changing it.

`apps/api/src/app.ts` echoes back only origins on this list; anything else gets no
`Access-Control-Allow-Origin` header and the browser blocks it. The default is
`http://localhost:3001`, which covers local dev but **not** the deployed dashboard — forgetting
this variable is the single most likely cause of "the dashboard loads but every request fails"
(the UI shows "Không kết nối được máy chủ…").

## 4. On the Firebase side

**Authentication → Settings → Authorized domains**: add the Vercel production domain and any
preview domain you sign in from (no wildcards). See `docs/deploy/firebase.md` §6.

## 5. Post-deploy checklist

1. Firebase → Authentication → Sign-in method: **Google** enabled.
2. Firebase → Authorized domains includes the Vercel domain.
3. `CORS_ORIGINS` on Railway includes the Vercel domain; API redeployed. Verify from the
   dashboard's browser console:
   `fetch('<api-base-url>/health').then(r => r.json())` → `{ ok: true }` with no CORS error.
4. Sign in once, then promote yourself with the SQL in `docs/deploy/railway.md` §4; until then
   the dashboard shows `/not-authorized`.
5. Photos render: they are 1-hour presigned R2 GET URLs loaded as plain `<img>`, so they need
   no R2 CORS rule (`docs/deploy/r2.md` §3).
