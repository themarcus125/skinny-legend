# Cloudflare Pages — member PWA (`apps/web`)

Vite 8 + React 19, React Router, TanStack Query, Tailwind v4, `vite-plugin-pwa` (Workbox
`generateSW`), Firebase web SDK for Google sign-in and FCM web push. Like the admin dashboard it
is a pure client of the Railway API: no server, no secrets, no database. Unlike the admin it is
an installable PWA, so two things beyond "serve the files" matter — the SPA fallback and the
service worker.

It depends on three workspace packages. `@skinny/ui` and `@skinny/api-client` ship TypeScript
source that Vite compiles directly; `@skinny/shared` resolves from `dist/`, so **it must be built
before `vite build`** — that is the only cross-package build step, and it is why the build command
below is not the default one.

## 1. Create the project

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick
this repository, then:

| Setting | Value |
| --- | --- |
| Framework preset | **None** |
| **Root directory** | **`apps/web`** |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @skinny/shared build && VITE_BUILD_ID=$CF_PAGES_COMMIT_SHA pnpm --filter @skinny/web build` (the prefix is the only place `VITE_BUILD_ID` can be set; see §2) |
| Build output directory | `apps/web/dist` |
| Node.js version | **22** — set `NODE_VERSION=22` as a build environment variable, or commit `.node-version`. Pages defaults to an older Node and the build fails on Vite 8. |
| Production branch | `main` |

The build command runs from the repo root even with the root directory set, so the `--filter`
flags resolve against the workspace. pnpm is detected from the root `pnpm-lock.yaml` and
`packageManager` field; the corepack shim Pages ships needs no extra configuration.

`pnpm --filter @skinny/web build` is `tsc --noEmit && vite build`: a type error fails the deploy
rather than shipping.

## 2. Environment variables

Set these under *Settings → Environment variables*, for **Production** and **Preview**
separately. Every one is `VITE_*`, i.e. inlined into the public bundle — none is a secret. The
authoritative list is `apps/web/src/vite-env.d.ts`.

| Variable | Required? | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | yes | The Railway API domain, **no trailing slash** (e.g. `https://skinny-legend-api.up.railway.app`). Also read at build time by `vite.config.ts`, which gives that origin an explicit `NetworkOnly` service-worker rule. |
| `VITE_FIREBASE_API_KEY` | yes | Firebase → Project settings → Your apps → Web app (`apiKey`) |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Same config (`authDomain`, e.g. `skinny-legend.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | yes | Same config (`projectId`) — must equal the API's `FIREBASE_PROJECT_ID` |
| `VITE_FIREBASE_APP_ID` | yes | Same config (`appId`) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes | Same config (`messagingSenderId`). Web push does not work without it. |
| `VITE_FIREBASE_VAPID_KEY` | yes for push | Firebase console → Project settings → **Cloud Messaging** → *Web configuration* → **Web Push certificates** → the "Key pair" value (generate one if the list is empty). Without it `getToken()` fails and the reminders toggle stays off. |
| `VITE_MOCK` | preview only | `1` on preview branches to run the whole app against the seeded mock client with no API and no Firebase. **Never `1` in production.** |
| `VITE_BUILD_ID` | no | **Not settable here** — the dashboard's env table stores values literally, so `$CF_PAGES_COMMIT_SHA` would be inlined as that literal text and never change. Put it on the *build command* instead: `VITE_BUILD_ID=$CF_PAGES_COMMIT_SHA pnpm --filter @skinny/web build`. Busts the persisted query cache on a new build (`src/lib/persist.ts`); without it a returning member can hydrate a 24-hour-old snapshot shaped by the previous release. |
| `VITE_R2_PUBLIC_HOST` | no | Only if the thumbnails are served from a custom domain instead of `*.r2.dev`: the bare hostname (no scheme), so the service worker's thumbnail cache rule matches it. |
| `NODE_VERSION` | yes | `22` (see above) |

The Firebase values must all be present together; with any missing, sign-in reports the missing
configuration instead of opening the Google popup.

## 3. SPA fallback

`apps/web/public/_redirects` is copied into `dist/` verbatim and Pages reads it:

```
/*    /index.html   200
```

Without it a hard refresh on `/leaderboard` is a 404 — the routes are client-side only.

The service worker **still** needs its own fallback, and does have one
(`workbox.navigateFallback: 'index.html'` in `apps/web/vite.config.ts`). The two are not
redundant: `_redirects` is what Cloudflare's edge does for a request that reaches the network,
and `navigateFallback` is what the installed worker does for a navigation it answers from the
cache — which, for a member who opened the app from the Home Screen with no signal, is every
navigation. Remove either one and a whole class of cold start breaks.

## 4. Two service-worker facts worth knowing before debugging it

**R2 thumbnails are cached under a query-stripped key.** The API hands out *presigned* GET URLs
with `expiresIn: 3600` (`apps/api/src/services/storage.ts`), so the same immutable object arrives
under a new `X-Amz-Signature` every hour. A `CacheFirst` rule keyed on the full URL would store a
fresh copy hourly and hit on almost nothing. The route's `cacheKeyWillBeUsed` plugin drops the
query string from the *cache key* only — the network request keeps its signature, or R2 answers
403. The derivation is `thumbnailCacheKey` in `apps/web/src/lib/thumbnail-cache.ts`, unit-tested
there and inlined into `dist/sw.js` at build time. `isThumbnailHost` in the same file is what
`VITE_R2_PUBLIC_HOST` feeds.

**Two things are deliberately not precached.** `globIgnores` in `apps/web/vite.config.ts`:

- `firebase-messaging-sw.js` — the site's *second* service worker, registered at its own narrower
  scope by `src/push/messaging.ts`. A precached copy would let a stale revision keep answering
  pushes after a deploy.
- `signin-bg.mp4` — a decoration shown once, on a screen a signed-in member never sees again.

**`assets/firebase-*.js` IS precached, on purpose.** It is ~190 KB (53 KB gzipped) in one chunk
and it is what a cold *offline* relaunch needs first: `src/auth/firebase.ts` imports it to restore
the session, and Pages serves `/assets/*` with `max-age=0, must-revalidate`, so a chunk that is
not in the precache cannot load without a network — the member would land on the sign-in screen
with a day of persisted data invisible behind it (checklist step 7.5). The `manualChunks` rule in
`vite.config.ts` is what gives the chunk its nameable prefix.

After a deploy, check the precache size in the build log (`PWA v1.3.0 … precache N entries`); a
jump of hundreds of KiB usually means a new pattern swept one of these back in.

## 5. On the API side (Railway) — CORS

The PWA is a different origin from the API. On the Railway `api` service:

| Variable | Value |
| --- | --- |
| `CORS_ORIGINS` | Comma-separated origins, **scheme and host only, no trailing slash, no path** — add the Pages production domain to what is already there, e.g. `https://skinny-legend-admin.vercel.app,https://skinny-legend.pages.dev,http://localhost:3001` |

Add each preview domain you actually sign in from as a further entry (`*.pages.dev` wildcards do
**not** work — `apps/api/src/app.ts` compares origins literally). Redeploy the API after changing
it. A forgotten entry looks like "the app loads but nothing ever arrives".

## 6. On the Firebase side

**Authentication → Settings → Authorized domains**: add the Pages production domain, plus any
preview domain you sign in from (again, no wildcards). Google sign-in from an unlisted domain
fails with `auth/unauthorized-domain`. See `docs/deploy/firebase.md` §6.

While you are in the console: **Cloud Messaging → Web Push certificates** is where
`VITE_FIREBASE_VAPID_KEY` comes from (§2), and iOS web push additionally requires the app to be
installed to the Home Screen — the app says so itself (`src/app/install-hint.tsx`).

## 7. Post-deploy checklist

1. Open the production domain on an iPhone in Safari, **Share → Add to Home Screen**, and launch
   from the icon: it opens without Safari chrome, on the right icon and splash colour.
2. Sign in with Google (this is what proves §6).
3. Track a photo end to end: presign → PUT to R2 → verdict sheet → the entry on Xếp hạng. The
   thumbnail rendering proves the R2 read path; `/places/nearby` resolving to a named place
   below the photo proves the OSM chip and its cache.
4. Turn on **Nhắc nhở** in Tài khoản, then send yourself one real push (Railway `notify` job, or
   the admin console) and confirm it arrives and that tapping it lands on `/track`. This only
   works from the installed app on iOS, and only with the VAPID key set.
5. Turn airplane mode on and relaunch: the offline strip appears and the last-known dashboard,
   leaderboard and history still render from the persisted cache (24 h, `src/lib/persist.ts`).
6. Deploy once more and reload: the app picks the new version up (`registerType: 'autoUpdate'`)
   without a manual cache clear.
