import { expect, test } from '@playwright/test';
import { ADMIN_URL, WEB_URL } from '../src/config.js';
import { member, resetAll, signInAdmin, signInWeb } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetAll();
});

/**
 * The brief's Step 9 test ids (`pending-screen`, `disabled-screen`, `member-row`,
 * `member-status`, `member-action-*`) are not in the product code yet and this task may not edit
 * apps/web or apps/admin, so the two flows are asserted through the gate routes and the
 * Vietnamese copy the run's `vi-VN` context renders. Swap in the test ids once they land.
 */
test('a pending member waits, an admin approves, and the member reaches the overview', async ({
  browser,
}) => {
  const admin = await member({
    name: 'Quản trị Onboarding',
    email: 'admin-onboarding@example.com',
    role: 'admin',
    status: 'active',
  });
  const newcomer = await member({
    name: 'Hà Onboarding',
    email: 'ha-onboarding@example.com',
    status: 'pending',
  });

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInWeb(memberPage, newcomer);
  await memberPage.waitForURL(`${WEB_URL}/pending`, { timeout: 30_000 });
  await expect(memberPage.getByText('Tài khoản đang chờ duyệt.')).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, admin);
  await adminPage.goto(`${ADMIN_URL}/members`);

  const row = adminPage.getByRole('row').filter({ hasText: newcomer.name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Chờ duyệt');
  await row.getByRole('button', { name: 'Duyệt' }).click();
  await expect(row).toContainText('Hoạt động');

  // The pending screen's "Kiểm tra lại" re-reads GET /me, which is how the approval lands.
  await memberPage.getByRole('button', { name: 'Kiểm tra lại' }).click();
  await memberPage.waitForURL(`${WEB_URL}/`, { timeout: 30_000 });
  await expect(memberPage.getByTestId('today-points')).toBeVisible();

  await memberContext.close();
  await adminContext.close();
});

test('an admin disables a member and the member lands on the disabled screen', async ({
  browser,
}) => {
  const admin = await member({
    name: 'Quản trị Khoá',
    email: 'admin-disable@example.com',
    role: 'admin',
    status: 'active',
  });
  const target = await member({
    name: 'Minh Khoá',
    email: 'minh-disable@example.com',
    status: 'active',
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, admin);
  await adminPage.goto(`${ADMIN_URL}/members`);

  const row = adminPage.getByRole('row').filter({ hasText: target.name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Khoá tài khoản' }).click();
  // The lock action is destructive, so it goes through a confirmation dialog.
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Khoá tài khoản', exact: true })
    .click();
  await expect(row).toContainText('Đã khoá');

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInWeb(memberPage, target);
  await memberPage.waitForURL(`${WEB_URL}/disabled`, { timeout: 30_000 });
  await expect(memberPage.getByText('Tài khoản đã bị khoá')).toBeVisible();

  await memberContext.close();
  await adminContext.close();
});
