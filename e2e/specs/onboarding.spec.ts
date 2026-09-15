import { expect, test } from '@playwright/test';
import { ADMIN_URL, WEB_URL } from '../src/config.js';
import { member, resetAll, signInAdmin, signInWeb } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetAll();
});

/**
 * The gate screens are asserted through the brief's Step 9 test ids (`pending-screen`,
 * `disabled-screen`) plus the gate route, so neither flow depends on the Vietnamese copy the
 * run's `vi-VN` context renders. The admin table still matches on copy — the member row's
 * status and actions have no stable text-free handle in this spec.
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
  await expect(memberPage.getByTestId('pending-screen')).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, admin);
  await adminPage.goto(`${ADMIN_URL}/members`);

  const row = adminPage.locator(`[data-testid="member-row"][data-user-id="${newcomer.userId}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId('member-status')).toHaveText('Chờ duyệt');
  await row.getByTestId('member-action-approve').click();
  await expect(row.getByTestId('member-status')).toHaveText('Hoạt động');

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

  const row = adminPage.locator(`[data-testid="member-row"][data-user-id="${target.userId}"]`);
  await expect(row).toBeVisible();
  await row.getByTestId('member-action-disable').click();
  // The lock action is destructive, so it goes through a confirmation dialog.
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Khoá tài khoản', exact: true })
    .click();
  await expect(row.getByTestId('member-status')).toHaveText('Đã khoá');

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInWeb(memberPage, target);
  await memberPage.waitForURL(`${WEB_URL}/disabled`, { timeout: 30_000 });
  await expect(memberPage.getByTestId('disabled-screen')).toBeVisible();

  await memberContext.close();
  await adminContext.close();
});
