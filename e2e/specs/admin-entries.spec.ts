import { expect, test, type APIRequestContext } from '@playwright/test';
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

/** Preflight R5: totals come from the dashboard, never from a column on `entries`. */
async function dashboardTotal(request: APIRequestContext, who: Member): Promise<number> {
  const token = await apiToken(who);
  const response = await request.get(`${API_URL}/me/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { total: number }).total;
}

async function myEntryPoints(request: APIRequestContext, who: Member, entryId: string): Promise<number | null> {
  const token = await apiToken(who);
  const response = await request.get(`${API_URL}/entries/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  const { entries } = (await response.json()) as { entries: { id: string; points: number }[] };
  return entries.find((row) => row.id === entryId)?.points ?? null;
}

test.beforeAll(async () => {
  await resetAll();
});

test('an entry reaches the admin list with its verdict, is rejected, and the member sees it', async ({
  browser,
  request,
}) => {
  const admin = await member({
    name: 'Quản trị',
    email: 'admin-entries@example.com',
    role: 'admin',
    status: 'active',
  });
  const ha = await member({ name: 'Hà', email: 'ha-entries@example.com', status: 'active' });

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInWeb(memberPage, ha);
  await memberPage.goto(`${WEB_URL}/track`);
  await uploadPhoto(memberPage, FIXTURES.group);
  await settleVerdict(memberPage);

  const [entry] = await query<{ id: string; status: string }>(
    'select id, status from entries order by created_at desc limit 1',
  );
  expect(entry).toBeTruthy();
  const totalBefore = await dashboardTotal(request, ha);
  const pointsBefore = await myEntryPoints(request, ha, entry!.id);
  expect(pointsBefore).not.toBeNull();

  // The member's own history lists the entry before the admin touches it — this is what makes the
  // post-rejection assertion below non-vacuous.
  await memberPage.goto(`${WEB_URL}/account`);
  const historyRow = memberPage.locator(`[data-testid="history-row"][data-entry-id="${entry!.id}"]`);
  await expect(historyRow).toBeVisible({ timeout: 30_000 });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, admin);
  await adminPage.goto(`${ADMIN_URL}/entries`);

  const row = adminPage.locator(`[data-testid="entry-row"][data-entry-id="${entry!.id}"]`);
  await expect(row).toBeVisible();
  // Tolerant about *which* verdict, strict about there being one. `not.toBeEmpty()` alone is
  // vacuous: `verdictSummary` renders "Không có" (common.none) for a missing verdict row, so the
  // cell has text either way. The real assertions are that the cell is not that none-label, and
  // that a verdict row exists in the database keyed to this entry — "AI lỗi" (a failed call) stays
  // legal per spec §3, and no category is ever named.
  await expect(row.getByTestId('entry-verdict')).not.toHaveText('Không có');
  const [verdict] = await query<{ failed: boolean; categories: string[] | null }>(
    // Preflight R6: the model's own answer lives in `categories_json`.
    'select failed, categories_json as categories from ai_verdicts where entry_id = $1',
    [entry!.id],
  );
  expect(verdict).toBeTruthy();
  expect(typeof verdict!.failed).toBe('boolean');
  expect(Array.isArray(verdict!.categories)).toBe(true);

  await row.getByTestId('entry-reject').click();
  await expect(row.getByTestId('entry-status')).toHaveText('Đã từ chối');

  const [afterReject] = await query<{ status: string }>('select status from entries where id = $1', [
    entry!.id,
  ]);
  expect(afterReject!.status).toBe('rejected');

  /**
   * Ruling: "the member's history shows the rejection and the points drop" is satisfied by two
   * facts together, because there is no such thing as a zero-point rejected history row — a
   * rejected entry does not appear in the member's history at all. `GET /entries/mine` filters
   * `status != 'rejected'` and `GET /users/:id/entries` keeps only `confirmed`
   * (apps/api/src/routes/entries.ts, routes/read.ts). So the assertions are:
   *   1. the entry leaves the history — the row was visible before the rejection (guarded above)
   *      and is gone after it; and
   *   2. the member's total falls — `GET /me/dashboard`, which is where points live at all
   *      (preflight R5).
   * The delta is not asserted exactly: the total also carries the streak bonus, which the scorer
   * owns independently of this entry.
   */
  expect(await myEntryPoints(request, ha, entry!.id)).toBeNull();
  expect(pointsBefore!).toBeGreaterThan(0);
  const totalAfter = await dashboardTotal(request, ha);
  expect(totalAfter).toBeLessThan(totalBefore);

  // The member's own screen reflects the rejection without a re-sign-in.
  await memberPage.reload();
  await expect(historyRow).toHaveCount(0, { timeout: 30_000 });

  await memberContext.close();
  await adminContext.close();
});
