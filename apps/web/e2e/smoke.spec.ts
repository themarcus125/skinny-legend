import { expect, test } from '@playwright/test';

test.describe('the shell', () => {
  test('boots in mock mode with the tab bar and the camera bubble', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(nav.getByRole('link')).toHaveText([
      'Tổng quan',
      'Xếp hạng',
      'Xu hướng',
      'Tài khoản',
    ]);

    // The separated camera bubble is an action, not a fifth tab.
    const bubble = page.getByRole('link', { name: 'Ghi nhận' });
    await expect(bubble).toBeVisible();
    const box = await bubble.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await nav.getByRole('link', { name: 'Xếp hạng' }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Xếp hạng' })).toBeVisible();

    await bubble.click();
    await expect(page).toHaveURL(/\/track$/);
  });

  test('serves an installable manifest and the generated icons', async ({ page, request }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBe('Skinny Legend');
    expect(manifest.short_name).toBe('Skinny Legend');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect((await request.get(`/${icon.src.replace(/^\//, '')}`)).ok()).toBe(true);
    }

    // iOS reads the link tag, never the manifest, for the home-screen icon.
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
  });
});
