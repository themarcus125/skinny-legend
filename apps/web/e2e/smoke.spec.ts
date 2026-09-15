import { expect, test } from '@playwright/test';

/** Only the fields this spec asserts on — enough to keep `response.json()` off `any`. */
interface WebManifest {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
}

test.describe('the shell', () => {
  test('boots in mock mode with the tab bar and the camera bubble', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(nav.getByRole('link')).toHaveText([
      'Trang chủ',
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

    // iOS parity (MainTabView's `role: .search` tab): the bubble sits at the TRAILING end,
    // inline with the capsule — same vertical centre, clear of it horizontally.
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(box!.x).toBeGreaterThan(navBox!.x + navBox!.width - 1);
    const bubbleCentre = box!.y + box!.height / 2;
    const navCentre = navBox!.y + navBox!.height / 2;
    expect(Math.abs(bubbleCentre - navCentre)).toBeLessThanOrEqual(2);

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
    const manifest = (await response.json()) as WebManifest;
    expect(manifest.name).toBe('Skinny Legend');
    expect(manifest.short_name).toBe('Skinny Legend');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
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

/**
 * Task 6's gate. Mock mode has no Firebase, so `mockAuthPort` keeps "am I signed in?" in
 * `localStorage` under `skinny.mock.signedIn` — seeding it with `'0'` is a fresh, signed-out
 * session, which is the only way to see the sign-in screen in a preview build.
 */
test.describe('the sign-in gate', () => {
  test('renders the sign-in screen for a signed-out session', async ({ page }) => {
    // Guarded, not unconditional: the script re-runs on every navigation, and a later reload
    // must not undo a sign-in the test just performed.
    await page.addInitScript(() => {
      if (localStorage.getItem('skinny.mock.signedIn') === null) {
        localStorage.setItem('skinny.mock.signedIn', '0');
      }
    });
    await page.goto('/');

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Skinny Legend');
    await expect(page.getByText('Chụp ảnh, ghi điểm, giữ chuỗi.')).toBeVisible();

    // The one primary call to action, at the design system's `lg` height.
    const google = page.getByRole('button', { name: 'Đăng nhập với Google' });
    await expect(google).toBeVisible();
    expect((await google.boundingBox())?.height ?? 0).toBeCloseTo(54, 0);

    // "Dùng dữ liệu mẫu" is dev-only; a production preview must not ship it.
    await expect(page.getByRole('button', { name: 'Dùng dữ liệu mẫu' })).toHaveCount(0);

    // The background clip and its poster are served from /public and are NOT precached.
    expect((await page.request.get('/signin-bg.mp4')).ok()).toBe(true);
    const video = page.locator('video');
    await expect(video).toHaveAttribute('preload', 'metadata');
    await expect(video).toHaveAttribute('poster', '/signin-bg-poster.jpg');
    expect((await page.request.get('/signin-bg-poster.jpg')).ok()).toBe(true);
  });

  test('signs in through the gate and back out again', async ({ page }) => {
    // Guarded, not unconditional: the script re-runs on every navigation, and a later reload
    // must not undo a sign-in the test just performed.
    await page.addInitScript(() => {
      if (localStorage.getItem('skinny.mock.signedIn') === null) {
        localStorage.setItem('skinny.mock.signedIn', '0');
      }
    });
    await page.goto('/sign-in');

    await page.getByRole('button', { name: 'Đăng nhập với Google' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();

    // An active member cannot sit on the gate routes.
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/$/);
  });
});
