import type { Page } from '@playwright/test';
import postgres from 'postgres';
import {
  clearEmulatorUsers,
  createMember,
  emulatorIdToken,
  resetDatabase,
  trackR2Key,
  type Member,
} from '@skinny/e2e-support';
import { ADMIN_URL, DATABASE_URL, EMULATOR_HOST, PROJECT_ID, R2_KEY_LOG, WEB_URL } from './config.js';

/** One connection per call: specs are serial, and this keeps no pool alive between them. */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    return (await sql.unsafe(text, params as never[])) as unknown as T[];
  } finally {
    await sql.end();
  }
}

/** Every spec's `beforeAll`: an empty database and an empty emulator (spec §3). */
export async function resetAll(): Promise<void> {
  await resetDatabase(DATABASE_URL);
  await clearEmulatorUsers({ host: EMULATOR_HOST, projectId: PROJECT_ID });
}

export const DEFAULT_PASSWORD = 'password123';

export function member(overrides: {
  name: string;
  email: string;
  password?: string;
  status?: 'pending' | 'active' | 'disabled';
  role?: 'member' | 'admin';
  locale?: 'vi' | 'en';
}): Promise<Member> {
  return createMember({
    databaseUrl: DATABASE_URL,
    host: EMULATOR_HOST,
    projectId: PROJECT_ID,
    password: DEFAULT_PASSWORD,
    ...overrides,
  });
}

async function fillEmulatorForm(page: Page, m: Member): Promise<void> {
  await page.getByTestId('emulator-email').fill(m.email);
  await page.getByTestId('emulator-password').fill(m.password);
  await page.getByTestId('emulator-submit').click();
}

/**
 * One bounded retry of a navigation. A long-lived `vite preview` / `next start` occasionally lets
 * the very first request of a context hang, and a `page.goto` timeout in a sign-in helper burns
 * the file's single retry before the test body has run at all. Two attempts, the first on
 * `domcontentloaded` so a slow subresource cannot be what times out; a second failure is real and
 * is rethrown.
 */
async function gotoTwice(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
}

/** Opens the web sign-in screen, signs in, and waits for the app to leave /sign-in. */
export async function signInWeb(page: Page, m: Member): Promise<void> {
  capturePresigns(page);
  await gotoTwice(page, `${WEB_URL}/sign-in`);
  await page.getByTestId('emulator-form').waitFor();
  await fillEmulatorForm(page, m);
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 60_000 });
}

/** Opens the admin console, signs in, and waits for the sidebar to replace the sign-in card. */
export async function signInAdmin(page: Page, m: Member): Promise<void> {
  capturePresigns(page);
  await gotoTwice(page, ADMIN_URL);
  await page.getByTestId('emulator-form').waitFor();
  await fillEmulatorForm(page, m);
  // Both the desktop rail and the mobile top bar render a <nav>; either one means we are in.
  await page.getByRole('navigation').first().waitFor({ timeout: 60_000 });
}

/**
 * Records every object key the API hands the page, so global teardown can delete exactly what
 * this run created even if a presigned PUT never reaches the bucket listing in time.
 */
export function capturePresigns(page: Page): void {
  page.on('response', (response) => {
    if (!response.url().endsWith('/uploads/presign') || !response.ok()) return;
    void response
      .json()
      .then((body: { key?: string }) => {
        if (body.key) trackR2Key(body.key, R2_KEY_LOG);
      })
      .catch(() => {
        // A body that is gone by teardown time is covered by the prefix sweep.
      });
  });
}

/** Sets the Track screen's library input to a fixture and waits for the verdict sheet. */
export async function uploadPhoto(page: Page, fixture: string): Promise<void> {
  await page.getByTestId('library-input').setInputFiles(fixture);
  await page.getByTestId('verdict-sheet').waitFor({ timeout: 90_000 });
}

/** A bearer token for `api.spec.ts`, straight from the emulator. */
export function apiToken(m: Member): Promise<string> {
  return emulatorIdToken({ host: EMULATOR_HOST, email: m.email, password: m.password });
}

/**
 * Closes the open verdict sheet the way its own state allows, and waits for it to detach.
 *
 * A successful verdict has already tracked the entry: the primary is a plain "Xong" that only
 * dismisses, and this must not touch a single chip — a correction is a different test. A real
 * OpenRouter call may instead come back `failed` (spec §3 keeps that legal), which is the one
 * state that opens the manual picker: `initVerdictState` sets `isEditingCategories` and leaves
 * the selection empty, so the chips render as `<button data-hit="44">` with no
 * `data-selected="true"` among them. That structural signal is the gate — never the primary's
 * disabled flag, which a transient saving state also raises on a perfectly successful verdict.
 */
export async function settleVerdict(page: Page, fallback = 'exercise'): Promise<void> {
  const sheet = page.getByTestId('verdict-sheet');
  await sheet.waitFor();
  const editable = sheet.locator('[data-testid="category-chip"][data-hit="44"]');
  const selected = sheet.locator('[data-testid="category-chip"][data-selected="true"]');
  if ((await editable.count()) > 0 && (await selected.count()) === 0) {
    await sheet.locator(`[data-testid="category-chip"][data-category="${fallback}"]`).click();
  }
  await page.getByTestId('verdict-primary').click();
  await sheet.waitFor({ state: 'detached', timeout: 60_000 });
}
