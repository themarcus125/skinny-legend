import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { isThumbnailHost, thumbnailCacheKey } from './src/lib/thumbnail-cache.ts';

/**
 * The version Account shows and `POST /feedback` carries, taken from `package.json` so there is
 * one number to bump — the web's answer to iOS's `CFBundleShortVersionString`.
 */
const APP_VERSION: string = (createRequire(import.meta.url)('./package.json') as { version: string })
  .version;

/** Light-theme `--background` from `@skinny/ui/styles/tokens.css`. */
const THEME_COLOR = '#EDECF1';

/**
 * The API's origin, when it is known at build time. React-query owns API data (it persists to
 * IndexedDB itself, spec §5), so the service worker must never hold a second, staler copy — this
 * origin gets an explicit `NetworkOnly` rule rather than relying on the absence of a match.
 */
function apiOrigin(): string | undefined {
  const raw = process.env.VITE_API_BASE_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/**
 * Workbox's `generateSW` writes `dist/sw.js` by *stringifying* the callbacks in `runtimeCaching`,
 * so a callback that closes over anything from this file would reference an identifier the worker
 * does not have. These two builders sidestep that by inlining the helper's own source text (and
 * any build-time value) into a function with no free variables — which is why
 * `src/lib/thumbnail-cache.ts` is written as two self-contained functions and unit-tested there
 * (`src/lib/thumbnail-cache.test.ts`) instead of being tested through a built worker.
 *
 * The `Function` constructor is the mechanism, and `no-implied-eval` is disabled for exactly the
 * two lines below: this runs in Node during the build, over this repository's own source text and
 * one build-time environment variable — there is no runtime input anywhere near it, and nothing
 * it produces is evaluated in the browser except as the emitted worker's own code.
 */
function thumbnailMatcher(publicHost: string | undefined) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- build-time codegen, see above
  return new Function(
    'options',
    `const matches = ${isThumbnailHost.toString()};
     return matches(options.url.hostname, ${JSON.stringify(publicHost ?? null)});`,
  ) as (options: { url: URL }) => boolean;
}

function thumbnailCacheKeyPlugin() {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- build-time codegen, see above
  return new Function(
    'options',
    `const derive = ${thumbnailCacheKey.toString()};
     return derive(options.request.url);`,
    // Workbox awaits whatever the hook returns, so the synchronous string is fine at runtime;
    // the cast is only to satisfy `WorkboxPlugin`'s promise-shaped signature.
  ) as (options: { request: Request }) => Promise<string | Request>;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Ruling R23: the service worker also runs under `vite dev`, so the shell can be exercised
      // (and the manifest fetched) without a production build in front of it.
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        // Vietnamese is the source of truth, so the install prompt speaks it too.
        lang: 'vi',
        dir: 'ltr',
        name: 'Skinny Legend',
        short_name: 'Skinny Legend',
        description: 'Operation Skinny Legend',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached; a navigation to any route falls back to it (SPA routing).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        /*
         * The FCM background worker is the site's *second* service worker and must stay out of
         * Workbox's hands entirely. Workbox owns `/sw.js` at scope `/`; `public/firebase-
         * messaging-sw.js` is served from the site root and registered by `src/push/messaging.ts`
         * at the narrower `/firebase-cloud-messaging-push-scope`, which is what lets the two
         * coexist (two registrations at the same scope replace one another).
         *
         * Precaching it would be actively wrong: the browser must fetch the worker script
         * itself, and a precached copy would let a stale revision keep answering pushes after a
         * deploy. It is the `js` extension in `globPatterns` above that would otherwise sweep it
         * in, since everything in `public/` is copied into the build output.
         */
        /*
         * `globPatterns` sweeps everything in `dist`; these three are the exceptions.
         *
         * 1. `firebase-messaging-sw.js` — the site's SECOND service worker (see above).
         * 2. `assets/firebase-*.js` — the Firebase SDK, ~350 KB across auth and messaging, which
         *    the app only ever loads dynamically (`src/push/messaging.ts`, `src/auth/firebase.ts`)
         *    and which a member who never enables reminders never fetches at all. Precaching it
         *    would make every install pay for it up front and re-download it on every deploy. The
         *    chunks are named by the `manualChunks` rule in `build.rollupOptions` below precisely
         *    so this pattern can name them; without it Rollup calls them `index.esm-<hash>.js`.
         * 3. `signin-bg.mp4` — a 2 MB decoration behind the sign-in screen, shown once. It is
         *    already outside `globPatterns` (no `mp4`), and named here so a later pattern edit
         *    cannot quietly pull a video into the precache manifest.
         */
        globIgnores: ['**/firebase-messaging-sw.js', '**/firebase-*.js', '**/signin-bg.mp4'],
        navigateFallback: 'index.html',
        // Never hand an API URL the shell: those are fetches, not navigations, but a bad
        // denylist entry is cheaper to reason about than a mis-served HTML body.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          ...(apiOrigin()
            ? [
                {
                  urlPattern: ({ url }: { url: URL }) => url.origin === apiOrigin(),
                  handler: 'NetworkOnly' as const,
                },
              ]
            : []),
          {
            /*
             * R2 entry thumbnails. The objects are immutable, but their URLs are NOT: the API
             * presigns them with `expiresIn: 3600` (`apps/api/src/services/storage.ts`), so the
             * same photo arrives under a new signature every hour. `cacheKeyWillBeUsed` drops the
             * query from the *key* — without it this CacheFirst route would store a duplicate
             * hourly and hit on almost nothing. The network request keeps its signature, or R2
             * answers 403.
             */
            urlPattern: thumbnailMatcher(process.env.VITE_R2_PUBLIC_HOST),
            handler: 'CacheFirst',
            options: {
              cacheName: 'skinny-thumbnails',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [{ cacheKeyWillBeUsed: thumbnailCacheKeyPlugin() }],
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        /*
         * One chunk per `@firebase/*` package instead of Rollup's default `index.esm-<hash>.js`,
         * so the precache exclusion above can name them and a build log says how much Firebase
         * actually costs. It groups by package boundary, which is where the natural split already
         * fell — no module moves between load graphs.
         */
        manualChunks(id: string) {
          const scoped = /node_modules\/@firebase\/([^/]+)\//.exec(id);
          if (scoped) return `firebase-${scoped[1]}`;
          if (id.includes('node_modules/firebase/')) return 'firebase-app';
          return undefined;
        },
      },
    },
  },
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  preview: { port: 4173 },
});
