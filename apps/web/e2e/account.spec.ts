import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** Where the plan collects its screenshots. */
const SHOTS = resolve(import.meta.dirname, '../../../.superpowers/sdd/2026-09-14-web-pwa');

test.describe('Tài khoản', () => {
  test('shows the profile header, the settings card and my history', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeVisible();

    await expect(page.getByTestId('account-name')).toHaveText('Khoa');
    await expect(page.getByTestId('account-summary')).toHaveText(/Hạng \d+ · \d+ điểm/);

    // The settings card, in the order `AccountView` lists them.
    await expect(page.getByTestId('language-picker').getByRole('radio')).toHaveCount(3);
    await expect(page.getByTestId('theme-picker').getByRole('radio')).toHaveCount(3);

    // "Nhắc nhở" sits between the appearance picker and the group fund, as in `AccountView`.
    // Headless WebKit exposes no `PushManager` and the preview has no Firebase project, so the
    // row is in its `unsupported` state — the switch disabled with the explanation under it.
    const reminders = page.getByTestId('reminders-row');
    await expect(reminders.getByRole('switch', { name: 'Nhắc nhở' })).toBeDisabled();
    await expect(reminders.getByTestId('alert-banner')).toContainText(
      'chưa hỗ trợ thông báo đẩy',
    );
    await reminders.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/web-account-reminders.png`, fullPage: true });
    await expect(page.getByRole('link', { name: 'Quỹ nhóm' })).toHaveAttribute(
      'href',
      'https://quy.momo.vn/v2/GZqk7REIhy?cover=f131',
    );
    await expect(page.getByTestId('app-version')).toHaveText(/\d+\.\d+\.\d+/);
    // Dev-only: a production bundle must not ship the sample-data exit at all.
    await expect(page.getByRole('button', { name: 'Thoát dữ liệu mẫu' })).toHaveCount(0);

    const rows = page.getByTestId('history-row');
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId('history-day').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-account.png`, fullPage: true });

    // The shell scrolls a div, so `fullPage` only ever captures the viewport: the history gets a
    // second frame of its own rather than going undocumented.
    await rows.first().scrollIntoViewIfNeeded();
    await expect(page.getByTestId('history-day-points').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/web-account-history.png`, fullPage: true });

    // "Không đúng?" opens the Track verdict sheet in edit mode over the same entry.
    await page.getByRole('button', { name: 'Không đúng?' }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Sửa hoạt động' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Huỷ' }).click();
    await expect(sheet).toBeHidden();

    // The profile sheet is the header's chevron.
    await page.getByTestId('account-header').click();
    await expect(page.getByTestId('profile-sheet')).toBeVisible();
    await expect(page.getByLabel('Tên hiển thị')).toHaveValue('Khoa');
  });

  test('renders on the dark palette', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('skinny.theme', 'dark'));
    await page.goto('/account');
    await expect(page.getByTestId('account-name')).toHaveText('Khoa');
    await expect(page.getByTestId('history-row').first()).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: `${SHOTS}/web-account-dark.png`, fullPage: true });
  });
});
