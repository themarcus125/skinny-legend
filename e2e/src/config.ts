import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { R2Config } from '@skinny/e2e-support';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const E2E_DIR = join(ROOT, 'e2e');

export const PORTS = { api: 3100, admin: 3101, web: 3102, emulator: 9099 } as const;
export const API_URL = `http://localhost:${PORTS.api}`;
export const ADMIN_URL = `http://localhost:${PORTS.admin}`;
export const WEB_URL = `http://localhost:${PORTS.web}`;
export const EMULATOR_HOST = `localhost:${PORTS.emulator}`;
export const PROJECT_ID = 'skinny-legend';

export const DATABASE_NAME = 'skinny_e2e';
export const ADMIN_DATABASE_URL =
  process.env.E2E_ADMIN_DATABASE_URL ?? 'postgres://skinny:skinny@localhost:5432/skinny';
export const DATABASE_URL = `postgres://skinny:skinny@localhost:5432/${DATABASE_NAME}`;

/** Matches STORAGE_KEY_PREFIX on the API process; the teardown sweeps this prefix in R2. */
export const STORAGE_PREFIX = 'e2e/';

export const LOG_DIR = join(E2E_DIR, 'logs');
export const R2_KEY_LOG = join(E2E_DIR, '.r2-keys.log');
export const PROCESS_FILE = join(E2E_DIR, '.processes.json');

/**
 * The suite's own timezone. Pinned on the Playwright project too, so `exifr`'s wall-clock parse
 * (apps/web/src/lib/exif.ts) yields the same calendar day on a UTC CI runner and an ICT laptop.
 */
export const TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Today's calendar date in `TIMEZONE`, as `YYYY-MM-DD`. */
function todayInTimezone(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The EXIF `DateTimeOriginal` date global setup bakes into the generated fixtures, and therefore
 * the `localDate` every entry made from one lands on. Defaults to today so the dashboard's Today
 * card is populated; `E2E_FIXTURE_DATE=YYYY-MM-DD` overrides it, which is how the suite proves its
 * expectations come from the fixture rather than the wall clock.
 */
export const FIXTURE_DATE = process.env.E2E_FIXTURE_DATE ?? todayInTimezone();

/** True on a normal run; false when `E2E_FIXTURE_DATE` points the fixtures at another day. */
export const FIXTURE_IS_TODAY = FIXTURE_DATE === todayInTimezone();

/** Generated per run by `scripts/make-fixtures.mjs`; gitignored, never committed. */
export const FIXTURES_DIR = join(E2E_DIR, '.fixtures');

export const FIXTURES = {
  exercise: join(FIXTURES_DIR, 'exercise.jpg'),
  meal: join(FIXTURES_DIR, 'meal.jpg'),
  group: join(FIXTURES_DIR, 'group.jpg'),
  noExif: join(FIXTURES_DIR, 'no-exif.jpg'),
} as const;

/** The secrets every run needs, from the root .env (loaded by global-setup) or the shell. */
export const REQUIRED_SECRETS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'OPENROUTER_API_KEY',
] as const;

export function r2Config(): R2Config {
  return {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET!,
  };
}

/**
 * The Firebase web config the two UIs are built with. The Auth Emulator validates none of it —
 * it only has to be non-empty so `hasFirebaseConfig` / `isFirebaseConfigured` return true.
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: 'fake-api-key',
  authDomain: 'localhost',
  projectId: PROJECT_ID,
  appId: '1:1234567890:web:e2e',
  messagingSenderId: '1234567890',
} as const;
