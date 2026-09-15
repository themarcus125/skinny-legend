import { expect, test } from '@playwright/test';
import { ADMIN_URL, WEB_URL } from '../src/config.js';
import { member, query, resetAll, signInAdmin, signInWeb } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetAll();
});

test('an admin changes a role and the change is audited', async ({ page }) => {
  const admin = await member({
    name: 'Quản trị Vai trò',
    email: 'admin-ops@example.com',
    role: 'admin',
    status: 'active',
  });
  const target = await member({
    name: 'Minh Vai trò',
    email: 'minh-ops@example.com',
    status: 'active',
    role: 'member',
  });

  await signInAdmin(page, admin);
  await page.goto(`${ADMIN_URL}/members`);
  const row = page.locator(`[data-testid="member-row"][data-user-id="${target.userId}"]`);
  await expect(row).toBeVisible();
  await row.getByTestId('member-role').click();
  // The options live in a portal outside the row; scoping to the open listbox keeps "Quản trị"
  // from also matching the admin's own name elsewhere on the page.
  await page.getByRole('listbox').getByRole('option', { name: 'Quản trị', exact: true }).click();

  await expect
    .poll(
      async () =>
        (await query<{ role: string }>('select role from users where id = $1', [target.userId]))[0]
          ?.role,
      { timeout: 20_000 },
    )
    .toBe('admin');

  const audit = await query<{ action: string; target_id: string }>(
    'select action, target_id from audit_log where actor_id = $1 order by created_at desc',
    [admin.userId],
  );
  expect(audit.some((e) => e.action === 'user.update' && e.target_id === target.userId)).toBe(true);
});

test('a test send is audited and leaves the reminder log alone', async ({ page }) => {
  const admin = await member({
    name: 'Quản trị Thông báo',
    email: 'admin-push@example.com',
    role: 'admin',
    status: 'active',
  });
  const ha = await member({ name: 'Hà Thông báo', email: 'ha-push@example.com', status: 'active' });
  // The API's fake sender (no FCM credentials in the e2e env) accepts any token; the row only
  // has to exist, because `POST /admin/notifications/test` 400s on a member with no device.
  await query('insert into device_tokens (user_id, token, platform, locale) values ($1, $2, $3, $4)', [
    ha.userId,
    'e2e-web-token',
    'web',
    'vi',
  ]);
  /**
   * Ruling R10: a test send never writes `notification_log` — its `kind` enum has no `test`
   * value, and writing one would suppress tomorrow's real reminder through the 24h dedupe rule.
   * So the rendered admin row this test asserts has to come from a real reminder, seeded here;
   * the count below then pins that the send added nothing to it.
   */
  await query(
    `insert into notification_log (user_id, kind, payload_json)
     values ($1, 'inactive_1d', $2::jsonb)`,
    [ha.userId, JSON.stringify({ title: 'Nhắc nhở', body: 'Hôm nay bạn chưa ghi gì.', locale: 'vi', vars: {} })],
  );

  await signInAdmin(page, admin);
  await page.goto(`${ADMIN_URL}/notifications`);
  // The seeded reminder renders in the log table — the admin row R10 asks for.
  const logRow = page.getByRole('row').filter({ hasText: 'Hà Thông báo' });
  await expect(logRow).toHaveCount(1, { timeout: 30_000 });
  await expect(logRow).toContainText('Vắng 1 ngày');

  // `TestSendForm` is a native <select>, not a combobox: pick by id, which needs no copy at all.
  await page.locator('#test-send-user').selectOption(ha.userId);
  await page.getByRole('button', { name: 'Gửi thử' }).click();

  await expect
    .poll(
      async () =>
        (
          await query<{ n: number }>(
            "select count(*)::int as n from audit_log where actor_id = $1 and action = 'notification.test' and target_id = $2",
            [admin.userId, ha.userId],
          )
        )[0]!.n,
      { timeout: 30_000 },
    )
    .toBe(1);

  // R10's other half: the log is exactly the seeded reminder, and the send added nothing.
  const [log] = await query<{ n: number }>(
    'select count(*)::int as n from notification_log where user_id = $1',
    [ha.userId],
  );
  expect(log!.n).toBe(1);
  await expect(logRow).toHaveCount(1);
});

test('member feedback reaches the admin feedback list', async ({ browser }) => {
  const admin = await member({
    name: 'Quản trị Góp ý',
    email: 'admin-feedback@example.com',
    role: 'admin',
    status: 'active',
  });
  const an = await member({ name: 'An Góp ý', email: 'an-feedback@example.com', status: 'active' });
  const message = 'Ứng dụng chạy tốt trong bài kiểm thử đầu cuối.';

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInWeb(memberPage, an);
  await memberPage.goto(`${WEB_URL}/account`);
  await memberPage.getByTestId('feedback-row').getByRole('button').click();
  const sheet = memberPage.getByTestId('feedback-sheet');
  await sheet.waitFor();
  // The sheet's only textarea, and the only footer button ("Gửi"); the header control is a
  // close button named "Huỷ", so the footer is addressed by its own name rather than by index.
  await sheet.locator('textarea').fill(message);
  await sheet.getByRole('button', { name: 'Gửi', exact: true }).click();
  await sheet.waitFor({ state: 'detached', timeout: 30_000 });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, admin);
  await adminPage.goto(`${ADMIN_URL}/feedback`);
  // `FeedbackList` renders one <article> per item and carries no test id.
  const feedbackRow = adminPage.getByRole('article').filter({ hasText: 'An Góp ý' });
  await expect(feedbackRow).toHaveCount(1, { timeout: 30_000 });
  await expect(feedbackRow).toContainText(message);

  const [stored] = await query<{ message: string }>(
    'select message from feedback where user_id = $1',
    [an.userId],
  );
  expect(stored!.message).toBe(message);

  await memberContext.close();
  await adminContext.close();
});
