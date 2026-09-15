import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** Where the plan collects its screenshots. */
const SHOTS = resolve(import.meta.dirname, '../../../.superpowers/sdd/2026-09-14-web-pwa');

test.describe('Trang chủ', () => {
  test('carries the group log under the dashboard and opens the map from a location', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();

    // The dashboard is on top; the log it used to link out to is now the tail of this screen.
    await expect(page.getByTestId('challenge-total')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nhật ký nhóm' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Nhật ký nhóm' })).toBeVisible();

    const days = page.getByTestId('feed-day');
    await expect(days.first()).toBeVisible();
    expect(await days.count()).toBeGreaterThan(1);
    await expect(page.getByTestId('feed-row').first()).toBeVisible();
    await expect(page.getByTestId('feed-footer')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-home.png`, fullPage: true });

    // /feed is a stale address now: old links and the push deep link land on Trang chủ.
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();

    // The map opens from the location on a row, not from a button over the feed.
    await expect(page.getByRole('link', { name: 'Bản đồ' })).toHaveCount(0);
    const place = page.getByTestId('feed-place').first();
    await expect(place).toBeVisible();
    const entryId = await place.getAttribute('data-entry-id');
    await expect(place).toHaveAccessibleName(/^Xem .+ trên bản đồ$/);
    await place.click();

    await expect(page).toHaveURL(new RegExp(`/feed/map\\?entry=${entryId}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Bản đồ' })).toBeVisible();

    // The tapped entry's card is already open, and every other pin is still on the map.
    await expect(page.getByTestId('cluster-sheet')).toBeVisible();
    await expect(
      page.locator(`[data-testid="pin-card"][data-entry-id="${entryId}"]`),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByTestId('cluster-sheet')).toBeHidden();
    // The page behind scrolls again once the modal sheet is gone.
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');

    // Offline the OSM tiles never arrive; the markers are ours and must be there regardless.
    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible();
    // The role and the name sit on Leaflet's own marker element — the node that carries
    // `tabindex="0"` and is therefore the one a reader lands on.
    const named = page.getByRole('button', { name: /mục ghi/ }).first();
    await expect(named).toHaveClass(/leaflet-marker-icon/);
    await expect(named).toHaveAttribute('tabindex', '0');
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      'OpenStreetMap contributors',
    );
    // "Tải lại" stays in the toolbar: the map owns its gestures, so pull-to-refresh is out.
    await expect(page.getByRole('button', { name: 'Tải lại' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-map.png` });

    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
