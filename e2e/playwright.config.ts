import { defineConfig, devices } from '@playwright/test';
import { E2E_DIR, R2_KEY_LOG, TIMEZONE, WEB_URL } from './src/config.js';

// The R2 key log is read by global teardown, which runs in its own process.
process.env.E2E_R2_KEY_LOG = R2_KEY_LOG;

export default defineConfig({
  testDir: './specs',
  // Spec §1: one worker, spec files serial. The specs share one database and one emulator.
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  outputDir: `${E2E_DIR}/test-results`,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  // The member app is a phone-shaped PWA; the admin console is a desktop dashboard. One project
  // with the phone profile, and the admin specs resize their own context where they need to.
  projects: [
    {
      name: 'e2e',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'vi-VN',
        // The fixtures' EXIF timestamp has no offset, so the browser reads it as local wall clock.
        // Pinning the context's zone is what makes a UTC CI runner agree with an ICT laptop about
        // which calendar day the photo was taken on.
        timezoneId: TIMEZONE,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
