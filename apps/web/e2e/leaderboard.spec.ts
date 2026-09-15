import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** Where the plan collects its screenshots. */
const SHOTS = resolve(import.meta.dirname, '../../../.superpowers/sdd/2026-09-14-web-pwa');

test.describe('Xếp hạng', () => {
  test('ranks the group and opens a member with their history', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Xếp hạng' })).toBeVisible();

    const rows = page.getByTestId('leaderboard-row');
    await expect(rows).toHaveCount(5);
    // Competition ranking (spec §3): a tie shares a rank and the next one skips.
    const ranks = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-rank')),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => Number(a) - Number(b)));
    expect(new Set(ranks).size).toBeLessThan(ranks.length);

    // Exactly one "you" pill, on the signed-in member's row.
    await expect(page.getByText('BẠN')).toHaveCount(1);
    await expect(rows.filter({ hasText: 'BẠN' })).toHaveAttribute('data-me', 'true');
    await page.screenshot({ path: `${SHOTS}/web-leaderboard.png`, fullPage: true });

    const first = rows.first();
    const name = await first.getByTestId('leaderboard-total').textContent();
    await first.click();
    await expect(page).toHaveURL(/\/leaderboard\/[\w-]+$/);

    await expect(page.getByTestId('member-name')).toBeVisible();
    await expect(page.getByTestId('member-total')).toHaveText(name ?? '');
    const historyRows = page.getByTestId('history-card').getByTestId('history-row');
    await expect(historyRows.first()).toBeVisible();
    await expect(page.getByTestId('history-footer')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-member.png`, fullPage: true });

    // SKI-134: a history row's location is the way onto the map, with that entry selected.
    const place = page.getByTestId('history-place').first();
    await expect(place).toBeVisible();
    await expect(place).toHaveAccessibleName(/^Xem .+ trên bản đồ$/);
    const entryId = await place.getAttribute('data-entry-id');
    await place.click();
    await expect(page).toHaveURL(new RegExp(`/feed/map\\?entry=${entryId}$`));
    await expect(page.getByTestId('cluster-sheet')).toBeVisible();
    await expect(
      page.locator(`[data-testid="pin-card"][data-entry-id="${entryId}"]`),
    ).toBeVisible();

    // The sheet is modal over the toolbar, so it goes before the back button is reachable.
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByTestId('cluster-sheet')).toBeHidden();

    // "Quay lại" undoes the step that got here, so it lands back on the member, not on Home.
    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL(/\/leaderboard\/[\w-]+$/);
    await expect(page.getByTestId('member-name')).toBeVisible();

    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
  });
});
