import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** Where the plan collects its screenshots. */
const SHOTS = resolve(import.meta.dirname, '../../../.superpowers/sdd/2026-09-14-web-pwa');

/**
 * A 96×96 JPEG carrying `DateTimeOriginal` 2026:09:14 10:12:30 (+07:00) and GPS coordinates
 * sitting exactly on the mock seed's "Phòng gym California Fitness", so the place list has one
 * real name to offer. Generated with Pillow — the snippet is in `task-8-report.md`.
 */
const PHOTO = resolve(import.meta.dirname, 'fixtures/entry.jpg');

test.describe('Ghi nhận', () => {
  test('tracks a photo, shows the verdict sheet and lands back on Trang chủ', async ({ page }) => {
    await page.goto('/track');
    await expect(page.getByRole('heading', { level: 1, name: 'Ghi nhận' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chụp ảnh/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Thư viện/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-track-empty.png`, fullPage: true });

    await page.getByTestId('library-input').setInputFiles(PHOTO);

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Đã ghi nhận' })).toBeVisible();
    await expect(sheet.getByText('Điểm đã cộng')).toBeVisible();
    // The EXIF fix resolves to the one seeded place inside the 300 m radius.
    await expect(page.getByTestId('place-option')).toContainText('Phòng gym California Fitness');
    await page.screenshot({ path: `${SHOTS}/web-track-verdict.png` });

    // "Xong" dismisses an already-tracked entry without a PATCH; the screen then celebrates
    // briefly and hands over to Trang chủ with the dashboard refetched.
    const primary = page.getByTestId('verdict-primary');
    await expect(primary).toHaveText('Xong');
    await primary.click();

    await expect(sheet).toBeHidden();
    await expect(page.getByText(/Đã ghi nhận \+\d+ điểm!/)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await expect(page.getByTestId('today-points')).toBeVisible();
  });
});
