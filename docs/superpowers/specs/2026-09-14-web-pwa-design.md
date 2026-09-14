# Operation Skinny Legend — Web PWA (member app) design

Date: 2026-09-14. Status: approved in chat, section by section, on 2026-09-14.

## 1. Purpose and decisions

A permanent second member client, at full parity with the iOS app, that the friend group can use before (and after) the Apple Developer account exists. Decisions made during brainstorming:

| Decision | Choice |
|---|---|
| Scope | Permanent client, full parity with iOS (not a stopgap) |
| Stack | Vite 6 + React 19 + TypeScript single-page app in `apps/web` (not part of the Next.js admin) |
| Place lookup | OpenStreetMap Nominatim, proxied and cached by the API (consistent with the admin's Leaflet/OSM map) |
| Push | Web Push through FCM (VAPID), same `device_tokens` table, `platform: 'web'` |
| Offline | Installable, precached shell, last-known data from cache; writes need a connection |
| Hosting | Cloudflare Pages (static), own domain |
| Sign-in | Google via Firebase now; Sign in with Apple when SKI-42 lands |
| Design | The Operation Skinny Legend design system (docs/design-system/tokens.md): Vanilla accent, light + dark, Be Vietnam Pro |
| Copy | Vietnamese source of truth, English translations reused from the iOS String Catalog |

Out of scope for v1: Sign in with Apple on the web, offline photo queueing, Home Screen quick actions, widgets/Live Activities.

## 2. Architecture and repo layout

```
apps/web/                 Vite + React SPA (mobile-first only)
packages/ui/              design tokens (CSS), type scale, Be Vietnam Pro via @fontsource, shared components
packages/api-client/      DTO types + Zod schemas re-exported from the API, typed fetch functions, error map, shared mock client + seed
apps/admin/               migrates to packages/ui and packages/api-client in the same change (no visual change)
apps/api/                 additive changes only (§3)
```

`apps/web` stack: React Router 7 (data routers), TanStack Query v5 with an IndexedDB persister, Tailwind v4 on the shared token layer, `vite-plugin-pwa` (manifest + Workbox service worker), Firebase web SDK (auth + messaging), `exifr` for client-side EXIF, Leaflet + react-leaflet for the map, Recharts for Trends, `use-intl` for i18n. Dev modes mirror the admin: `VITE_MOCK=1` uses the shared mock client; otherwise the real API with a Firebase ID token as bearer (`AUTH_MODE=test` on the API for local dev with the `x-test-uid` header, exposed only in dev builds).

The PWA renders a bottom tab bar (Tổng quan, Xếp hạng, Xu hướng, Tài khoản) plus a separated camera bubble for Ghi nhận, fixed above `env(safe-area-inset-bottom)`, with large titles that collapse on scroll. There is no desktop layout; on wide viewports the app is centred at 430 px.

## 3. API changes (additive; iOS untouched)

### 3.1 Places
- `GET /places/nearby?lat=<number>&lng=<number>` (member, `requireActive`). Returns `{ places: [{ name, lat, lng, distanceM, source: 'osm' }], attribution: '© OpenStreetMap contributors' }`, at most 8 results within 300 m, nearest first.
- Implementation: Nominatim reverse geocode (`/reverse`, `zoom=18`) plus `/search` bounded to the 300 m box, both with a project-identifying `User-Agent`, serialised through an in-process queue enforcing one outbound request per second, 5 s timeout.
- Cache: new table `place_cache(cell text primary key, payload_json jsonb, fetched_at timestamptz)`, `cell` = lat/lng rounded to 3 decimals (~110 m). Hits younger than 30 days are served from cache; misses fetch and upsert. Migration 0003.
- `placeSource` enum gains `osm`. Existing `mapkit`, `manual`, `none` unchanged.
- Errors: Nominatim failure or timeout → 200 with an empty list and `degraded: true` (the client falls back to "Không tìm thấy địa điểm" and lets the member type a name), never a 5xx.
- Tests: unit tests with a fake fetch for cache hit/miss/degraded and the rate limiter; a route test for validation (400 `invalid_body` on missing/out-of-range coordinates) and the shape.

### 3.2 Web devices
- `device_platform` enum gains `web` (migration 0003, same file as 3.1). `POST /me/devices` accepts `platform: 'web'`; the zod schema and the iOS-only assumption in tests are updated.
- The notify job and the admin test-send are unchanged: FCM `sendEach` delivers to web registration tokens identically; `registration-token-not-registered` pruning already applies.
- The admin notifications page shows the platform in the log row (one badge, catalog rows `notifications.platform.ios` / `.web`).

### 3.3 Everything else already fits
- Auth: `POST /auth/session` with a Firebase ID token from the web SDK; `GET/PATCH /me` incl. `locale`.
- Uploads: `POST /uploads/presign` then a presigned R2 PUT from the browser; the R2 CORS policy in docs/deploy/r2.md already allows PUT from any origin (the signature is the guard).
- Entries: `POST /entries` (auto-confirm from the verdict), `PATCH` (≥1 category), `DELETE`; `takenAt` and `point` come from client EXIF when present, else from `navigator.geolocation` at capture time and the current time.
- Read routes: dashboard, leaderboard, member history, trends, feed, `GET /entries/map?days=30`.

## 4. Screens (route → iOS counterpart)

| Route | Screen | Notes |
|---|---|---|
| `/sign-in` | SignInView | Google primary button (54 px), looping video background with gradient fallback (`prefers-reduced-motion` → gradient), dev-only "Dùng dữ liệu mẫu" ghost button. Pending / disabled full screens. |
| `/` | Tổng quan | today's points + delta, streak counter (7-day dots), rank, checklist, challenge total (accent card), "Nhật ký nhóm" card → `/feed`. |
| `/track` | Ghi nhận | camera via `<input type="file" accept="image/*" capture="environment">`, library via a plain file input; upload progress bar; verdict bottom sheet: "Đã ghi nhận" + points earned + "Xong", "Không đúng?" chips → "Lưu thay đổi"; failed verdict → "Chọn hoạt động" + "Xác nhận"; empty selection never saveable; place chip with nearby places from §3.1 and manual entry. |
| `/leaderboard`, `/leaderboard/:userId` | Xếp hạng, MemberDetail | rows with rank/avatar/name/weekly delta/points, "BẠN" pill; member history as one card, cursor paging. |
| `/trends` | Xu hướng | weekly points bars and active-days heatmap (Recharts), same data shapes, localised axis labels. |
| `/feed`, `/feed/map` | Feed, MapScreen | feed list grouped by day; Leaflet map with the ported 50 m clustering, avatar pins, count badge, pin card / cluster list, "Tải lại". |
| `/account` | Account | profile edit (name, avatar upload), history with "Không đúng?" edits, language picker (Hệ thống/Tiếng Việt/English), reminders toggle with denied-state explanation, Quỹ nhóm link, feedback sheet, sign out, dev-only "Thoát dữ liệu mẫu", theme override (Hệ thống/Sáng/Tối). |

Deep link from a push tap: `/track`.

## 5. Data, session, offline, push

- **Data**: TanStack Query; persisted to IndexedDB (`persistQueryClient` + idb-keyval) with `maxAge` 24 h; `refetchOnWindowFocus` and `refetchOnReconnect` on; an "Đang ngoại tuyến" banner while `navigator.onLine` is false. Mutations require a connection; errors map through `describeError` (shared) to catalog keys. Photo PUT uses `XMLHttpRequest` for upload progress.
- **Session**: Firebase auth persistence `indexedDBLocalPersistence`; on launch restore → `POST /auth/session` → route by `status` (pending / disabled / active). Locale reconciliation per the iOS ruling: explicit local vi/en pushes on mismatch; "system" adopts an explicit server value; fresh install pushes the device-resolved language and stores "system".
- **PWA shell**: `vite-plugin-pwa` in `generateSW` mode with `navigateFallback` to `index.html`, precached shell, runtime caching of R2 thumbnails (cache-first, 7 days, 200 entries), never caching API responses in the SW (react-query owns data). Manifest: name, short name "Skinny Legend", `display: standalone`, theme/background colours from the tokens, icons 192/512 + maskable from the new flame icon, `start_url: /`. iOS meta: `apple-mobile-web-app-capable`, status bar style, `apple-touch-icon`. A one-time "Thêm vào màn hình chính" hint on iOS Safari (needed for push).
- **Push**: Firebase Messaging web with `VITE_FIREBASE_VAPID_KEY`; `public/firebase-messaging-sw.js` receives background messages and opens `/track` on click (`data.deepLink`). Registrar mirrors iOS: ask after the first tracked entry (once per user id), register `{ token, platform: 'web', locale: resolved }`, pending-until-token, re-register on locale change while enabled, delete on sign-out (bounded, best-effort), clear local state on 401. Foreground messages show an in-app toast. Unsupported browsers (no `Notification`/SW push) show the toggle as unavailable with an explanation.

## 6. Design system, i18n, shared packages

- **`packages/ui`**: `tokens.css` (light `:root`, dark `.dark`, incl. the documented accessibility deviations), `type.css`, Be Vietnam Pro 400–800 via `@fontsource/be-vietnam-pro` (OFL), components: Button (primary/secondary/ghost/destructive × sm/md/lg, loading), Badge (semantic soft fills), SurfaceCard (+ accent), AlertBanner, EmptyState, ProgressBar, ProgressRing, StreakCounter, Avatar (+ overflow), CategoryChip, LeaderboardRow. The admin replaces its local copies with imports; shadcn base components stay per app.
- **`packages/api-client`**: the wire zod schemas and inferred DTO types move to `packages/shared/src/wire/` (the API's routes and this package both import them from `@skinny/shared`, so there is one source and no circular dependency), `client.ts` (`createApiClient({ baseUrl, getToken })`), `errors.ts` (`ApiError`, `describeError → key`), `mock/` (seed + in-memory client mirroring iOS `MockSeed`).
- **i18n**: `use-intl`; `apps/web/messages/{vi,en}.json` seeded from `ios/SkinnyLegend/Localizable.xcstrings` (vi key → en value) plus web-only strings; the admin's `lint-i18n.mjs` reused; parity/echo/empty guards; `<html lang>` follows the locale.
- **Dark mode**: `prefers-color-scheme` with an Account override persisted locally (`.dark` on `<html>`), same semantics as the admin toggle.

## 7. Testing and deployment

- **Unit/component**: Vitest + RTL against the shared mock client; ports of the iOS pure logic with mirrored cases: clustering, streak dots, verdict-sheet state machine (`outcome`, `canSave`, `needsSave`), app-mode decision, locale resolution, push registrar (pending, refresh completes, sign-out clears, per-user ask).
- **E2E**: Playwright, iPhone viewport, mock mode: sign-in → track a fixture photo → verdict sheet → leaderboard shows the entry → account language switch renders English → manifest served and installable.
- **Push**: unit-tested with a fake messaging module; real FCM verified by hand once the VAPID key exists.
- **Deployment**: Cloudflare Pages, root `apps/web`, build `pnpm --filter @skinny/web build`, output `dist`; env `VITE_API_BASE_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_VAPID_KEY`, `VITE_MOCK` (previews). Runbook `docs/deploy/web-pages.md`; the API's `CORS_ORIGINS` and Firebase authorized domains gain the Pages domain.

## 8. Rollout

Members are invited to the web URL once the API and Firebase are live; the same admin approval flow gates access. iOS keeps its own release track; the two clients share the API contract, the copy, and the token layer.
