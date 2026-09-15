import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Member } from '@skinny/e2e-support';
import { ADMIN_URL, API_URL, FIXTURES, WEB_URL } from '../src/config.js';
import {
  apiToken,
  member,
  query,
  resetAll,
  settleVerdict,
  signInAdmin,
  signInWeb,
  uploadPhoto,
} from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetAll();
});

/**
 * The four test ids the brief asked for (`profile-name`, `avatar-input`, `feedback-message`,
 * `feedback-send`) were not added: this task may not edit `apps/*`, and none of them is needed.
 * Each control is the only one of its kind inside a sheet that already has a test id, so a
 * structural selector scoped to `profile-sheet` / `feedback-sheet` is just as stable and does
 * not depend on the run's Vietnamese copy.
 */
function profileName(page: Page) {
  return page.getByTestId('profile-sheet').locator('input[type="text"]');
}
function avatarInput(page: Page) {
  return page.getByTestId('profile-sheet').locator('input[type="file"]');
}

/** The member's own leaderboard row — the only place `/me`'s avatar key becomes a URL. */
async function myAvatarUrl(request: APIRequestContext, who: Member): Promise<string | null> {
  const token = await apiToken(who);
  const response = await request.get(`${API_URL}/leaderboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  const { leaderboard } = (await response.json()) as {
    leaderboard: { isMe: boolean; user: { avatarUrl: string | null } }[];
  };
  return leaderboard.find((row) => row.isMe)?.user.avatarUrl ?? null;
}

test('a member edits their name and avatar, and the avatar lands in R2', async ({
  page,
  request,
}) => {
  const ha = await member({ name: 'Hà', email: 'ha-account@example.com', status: 'active' });
  await signInWeb(page, ha);
  await page.goto(`${WEB_URL}/account`);

  await page.getByTestId('account-header').click();
  await page.getByTestId('profile-sheet').waitFor();
  await profileName(page).fill('Hà Nguyễn');
  await avatarInput(page).setInputFiles(FIXTURES.noExif);
  await page.getByTestId('avatar-preview').waitFor();
  await page.getByTestId('profile-save').click();
  await page.getByTestId('profile-sheet').waitFor({ state: 'detached', timeout: 60_000 });

  await expect(page.getByTestId('account-name')).toHaveText('Hà Nguyễn');
  const [row] = await query<{ display_name: string; avatar_key: string | null }>(
    'select display_name, avatar_key from users where id = $1',
    [ha.userId],
  );
  expect(row!.display_name).toBe('Hà Nguyễn');
  // `STORAGE_KEY_PREFIX` is `e2e/` on the e2e API process, and the avatar folder is `avatars`.
  expect(row!.avatar_key).toMatch(/^e2e\/avatars\//);

  /**
   * The object is really in the bucket. Tolerant real-service rule: the assertion is a GET of
   * the avatar URL answering 200 with an image content type — never a byte count or an ETag,
   * which the conversion step owns. The URL comes from the API rather than from an `<img>` in
   * the DOM, because the header avatar falls back to initials until the board query refetches.
   */
  const url = await myAvatarUrl(request, ha);
  expect(url).toBeTruthy();
  const object = await request.get(url!);
  expect(object.status()).toBe(200);
  expect(object.headers()['content-type']).toContain('image');
});

test('switching the language writes users.locale, which the admin sees', async ({
  browser,
  request,
}) => {
  const minh = await member({
    name: 'Minh',
    email: 'minh-account@example.com',
    status: 'active',
    locale: 'vi',
  });
  const admin = await member({
    name: 'Quản trị Tài khoản',
    email: 'admin-account@example.com',
    role: 'admin',
    status: 'active',
  });

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInWeb(memberPage, minh);
  await memberPage.goto(`${WEB_URL}/account`);
  // The picker is a `role="radiogroup"` of buttons; `data-value` is the copy-free handle.
  await memberPage.getByTestId('language-picker').locator('[data-value="en"]').click();

  await expect
    .poll(
      async () =>
        (await query<{ locale: string }>('select locale from users where id = $1', [minh.userId]))[0]
          ?.locale,
      { timeout: 20_000 },
    )
    .toBe('en');

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, admin);
  await adminPage.goto(`${ADMIN_URL}/members`);
  await expect(
    adminPage.locator(`[data-testid="member-row"][data-user-id="${minh.userId}"]`),
  ).toBeVisible();

  /**
   * Ruling R12 asks for the member's locale *in the admin members list*. The rendered table has
   * no locale column (`members-table.tsx` shows name / status / role / joined / actions), so the
   * list is asserted where it does carry the field: the payload `GET /admin/users` hands the
   * console, read with the admin's own token.
   */
  const token = await apiToken(admin);
  const response = await request.get(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  const { users } = (await response.json()) as { users: { id: string; locale: string }[] };
  expect(users.find((user) => user.id === minh.userId)?.locale).toBe('en');

  await memberContext.close();
  await adminContext.close();
});

test('a member deletes an entry and signs out', async ({ page }) => {
  const an = await member({ name: 'An', email: 'an-account@example.com', status: 'active' });
  await signInWeb(page, an);
  await page.goto(`${WEB_URL}/track`);
  await uploadPhoto(page, FIXTURES.exercise);
  // A real OpenRouter call may come back `failed`, which opens the manual picker; `settleVerdict`
  // is the helper that closes either shape without touching a successful verdict's chips.
  await settleVerdict(page);

  const [entry] = await query<{ id: string }>(
    'select id from entries where user_id = $1 order by created_at desc limit 1',
    [an.userId],
  );
  expect(entry).toBeTruthy();

  await page.goto(`${WEB_URL}/track`);
  const historyRow = page.locator(`[data-testid="history-row"][data-entry-id="${entry!.id}"]`);
  await expect(historyRow).toBeVisible({ timeout: 30_000 });
  // The row is an <li> wrapping one full-width button: a tap anywhere on it opens the verdict
  // sheet in edit mode.
  await historyRow.getByRole('button').click();
  await page.getByTestId('verdict-sheet').waitFor();
  await page.getByTestId('verdict-delete').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Xoá' }).click();

  /**
   * Deviation from the brief, which polls `count(*) = 0` on `entries`. `DELETE /entries/:id` is a
   * **soft** delete (apps/api/src/routes/entries.ts sets `status = 'rejected'`), so the row never
   * leaves the table and that poll could only ever time out. The two facts that do hold are the
   * new status and the row leaving the member's own history.
   */
  await expect
    .poll(
      async () =>
        (await query<{ status: string }>('select status from entries where id = $1', [entry!.id]))[0]
          ?.status,
      { timeout: 30_000 },
    )
    .toBe('rejected');
  await expect(historyRow).toHaveCount(0, { timeout: 30_000 });

  await page.getByTestId('sign-out-row').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL(/\/sign-in$/, { timeout: 30_000 });
  await expect(page.getByTestId('emulator-form')).toBeVisible();

  // Signing out has to clear the *persisted* Firebase credential, not just the in-memory one:
  // asking for a guarded route again must bounce back to sign-in rather than restore the session
  // from IndexedDB.
  await page.goto(`${WEB_URL}/account`);
  await page.waitForURL(/\/sign-in$/, { timeout: 30_000 });
  await expect(page.getByTestId('emulator-form')).toBeVisible();
});
