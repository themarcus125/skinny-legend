import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
            // R2 entry thumbnails: immutable objects behind a signed-free public host.
            urlPattern: ({ url }) => /\.r2\.(dev|cloudflarestorage\.com)$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'skinny-thumbnails',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  preview: { port: 4173 },
});
