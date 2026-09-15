import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The 96×96 JPEG from Task 8: `DateTimeOriginal` 2026:09:14 10:12:30 (+07:00) and a GPS fix on
 * the mock seed's "Phòng gym California Fitness".
 */
const PHOTO = resolve(import.meta.dirname, 'fixtures/entry.jpg');

/** Only the fields this spec asserts on. */
interface WebManifest {
  name: string;
  short_name: string;
  start_url: string;
}

/**
 * Spec §7's end-to-end list, walked once as a single session: sign in, track a photo, read the
 * verdict, find the entry on the leaderboard, switch the language and confirm the app is
 * installable. The other e2e specs each prove one screen in depth; this one proves the seams
 * between them — a screen that works in isolation and breaks when it is reached from the one
 * before it is exactly what a per-screen suite cannot see.
 *
 * Serial, and in this order: every step depends on the state the previous one left behind (the
 * mock signs in through `localStorage`, and the tracked entry has to exist before the leaderboard
 * can show it).
 */
test.describe.configure({ mode: 'serial' });

test.describe('the member journey', () => {
  test('signs in, tracks a photo, sees it ranked and switches language', async ({ page }) => {
    // A signed-out session: `mockAuthPort` keeps the flag here, so seeding `'0'` is a fresh
    // install. Guarded, because the script re-runs on every navigation and must not sign the
    // member back out after the click below.
    await page.addInitScript(() => {
      if (localStorage.getItem('skinny.mock.signedIn') === null) {
        localStorage.setItem('skinny.mock.signedIn', '0');
      }
    });

    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Đăng nhập với Google' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    // Ghi nhận — the camera bubble, then a photo out of the library.
    await page.getByRole('link', { name: 'Ghi nhận' }).click();
    await expect(page).toHaveURL(/\/track$/);
    await page.getByTestId('library-input').setInputFiles(PHOTO);

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Đã ghi nhận' })).toBeVisible();
    await expect(page.getByTestId('place-option')).toContainText('Phòng gym California Fitness');
    await page.getByTestId('verdict-primary').click();
    await expect(sheet).toBeHidden();

    // The celebration hands over to Tổng quan with the dashboard refetched.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('today-points')).toBeVisible();

    // Xếp hạng — the entry is on the board, on the signed-in member's own row.
    await page.getByRole('link', { name: 'Xếp hạng' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Xếp hạng' })).toBeVisible();
    const mine = page.getByTestId('leaderboard-row').filter({ hasText: 'BẠN' });
    await expect(mine).toHaveCount(1);
    await expect(mine).toHaveAttribute('data-me', 'true');

    // Tài khoản — the language choice re-renders the app against the English catalog.
    await page.getByRole('link', { name: 'Tài khoản' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeVisible();
    await page.getByTestId('language-picker').getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    // `<html lang>` follows the catalog, for assistive tech and Safari's translation prompt.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Installable: the manifest is served from the build, not from the dev plugin's memory.
    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    const parsed = (await manifest.json()) as WebManifest;
    expect(parsed.name).toBe('Skinny Legend');
    expect(parsed.short_name).toBe('Skinny Legend');
    expect(parsed.start_url).toBe('/');
  });
});
