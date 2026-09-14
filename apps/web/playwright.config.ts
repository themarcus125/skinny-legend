import { defineConfig, devices } from '@playwright/test';

/** Clear of the admin's :3001 and Vite's default :5173. */
const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // There is no desktop layout (spec §2), so there is no desktop project either.
  // `vi-VN` because Vietnamese is the source of truth and the locale choice defaults to
  // "system": the assertions read the same copy the catalog is authored in.
  projects: [{ name: 'iphone', use: { ...devices['iPhone 15'], locale: 'vi-VN' } }],
  webServer: {
    // Ruling R23: `vite preview` over `dist`, not the dev server — the smoke test asserts the
    // manifest and the service worker, which only a real build produces in their final shape.
    command: 'pnpm build && pnpm preview',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_MOCK: '1' },
  },
});
