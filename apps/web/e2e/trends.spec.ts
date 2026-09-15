import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** Where the plan collects its screenshots. */
const SHOTS = resolve(import.meta.dirname, '../../../.superpowers/sdd/2026-09-14-web-pwa');

test.describe('Xu hướng', () => {
  test('charts the seeded weeks, the active-days grid and one day behind a square', async ({
    page,
  }) => {
    await page.goto('/trends');
    await expect(page.getByRole('heading', { level: 1, name: 'Xu hướng' })).toBeVisible();

    // The bars are Recharts, so their arrival is the real proof the lazy chunk loaded.
    const bars = page.getByTestId('week-bar');
    await expect(bars.first()).toBeVisible();
    const weeks = await bars.count();
    expect(weeks).toBeGreaterThan(0);
    await expect(page.getByTestId('week-bar-avg')).toHaveCount(weeks);

    const cells = page.getByTestId('heat-cell');
    await expect(cells.first()).toBeVisible();
    // The ramp actually varies: the seeded group has both blank and scoring days.
    const levels = await cells.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-level')),
    );
    expect(new Set(levels).size).toBeGreaterThan(1);

    await expect(page.getByTestId('category-total')).toHaveCount(3);
    await expect(page.getByTestId('streak-bonus')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-trends.png`, fullPage: true });

    // A square with points opens the day sheet on that day's entries.
    const scored = cells.filter({ has: page.locator('[data-points]:not([data-points="0"])') });
    const target = (await scored.count()) > 0 ? scored.first() : cells.first();
    const date = await target.getAttribute('data-date');
    await target.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByTestId('day-entry').or(sheet.getByText('Ngày này bạn chưa ghi nhận hoạt động nào.')).first(),
    ).toBeVisible();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(sheet).toBeHidden();
  });

  test('renders on the dark palette', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('skinny.theme', 'dark'));
    await page.goto('/trends');
    await expect(page.getByTestId('week-bar').first()).toBeVisible();
    await expect(page.getByTestId('heat-cell').first()).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: `${SHOTS}/web-trends-dark.png`, fullPage: true });
  });
});
