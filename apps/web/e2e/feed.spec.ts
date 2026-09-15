import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** Where the plan collects its screenshots. */
const SHOTS = resolve(import.meta.dirname, '../../../.superpowers/sdd/2026-09-14-web-pwa');

test.describe('Nhật ký nhóm', () => {
  test('groups the feed by day and opens the map from the toolbar', async ({ page }) => {
    await page.goto('/feed');
    await expect(page.getByRole('heading', { level: 1, name: 'Nhật ký nhóm' })).toBeVisible();

    const days = page.getByTestId('feed-day');
    await expect(days.first()).toBeVisible();
    expect(await days.count()).toBeGreaterThan(1);
    await expect(page.getByTestId('feed-row').first()).toBeVisible();
    await expect(page.getByTestId('feed-footer')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-feed.png`, fullPage: true });

    await page.getByRole('link', { name: 'Bản đồ' }).click();
    await expect(page).toHaveURL(/\/feed\/map$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bản đồ' })).toBeVisible();

    // Offline the OSM tiles never arrive; the markers are ours and must be there regardless.
    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible();
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      'OpenStreetMap contributors',
    );
    await page.screenshot({ path: `${SHOTS}/web-map.png` });

    // Tapping a clustered marker opens its pins; the count badge says how many.
    await markers.first().click();
    await expect(page.getByTestId('cluster-sheet')).toBeVisible();
    await expect(page.getByTestId('pin-card').first()).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByTestId('cluster-sheet')).toBeHidden();

    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL(/\/feed$/);
  });
});
