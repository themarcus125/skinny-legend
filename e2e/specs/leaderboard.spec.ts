import { expect, test, type Page } from '@playwright/test';
import type { Member } from '@skinny/e2e-support';
import { API_URL, FIXTURES, WEB_URL } from '../src/config.js';
import { apiToken, member, resetAll, settleVerdict, signInWeb, uploadPhoto } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

/** `GET /leaderboard` — Preflight R8: the rows arrive wrapped in `{ leaderboard }`. */
interface LeaderboardRow {
  rank: number;
  total: number;
  weekPoints: number;
  isMe: boolean;
  user: { id: string; displayName: string };
}

/** `GET /me/trends` — Preflight R7: one row per ISO week, never `{ points }`. */
interface TrendsWeek {
  week: string;
  mine: number;
  groupAvg: number;
  rank: number;
}

let ha: Member;
let minh: Member;
let an: Member;

/**
 * One tracked entry, in its own context so each member signs in on a clean session.
 *
 * `settleVerdict` is what makes the points real: a live OpenRouter call may come back `failed`
 * (spec §3 keeps that legal), and the sheet then holds a disabled primary until a category is
 * picked — an entry left that way is abandoned, scores nothing, and the board would be empty.
 */
async function track(page: Page, who: Member, fixture: string, category: string): Promise<void> {
  await signInWeb(page, who);
  await page.goto(`${WEB_URL}/track`);
  await uploadPhoto(page, fixture);
  await settleVerdict(page, category);
}

test.beforeAll(async ({ browser }) => {
  await resetAll();
  ha = await member({ name: 'Hà', email: 'ha-board@example.com', status: 'active' });
  minh = await member({ name: 'Minh', email: 'minh-board@example.com', status: 'active' });
  an = await member({ name: 'An', email: 'an-board@example.com', status: 'active' });

  // Three members with real entries, so the ranks have something to order.
  for (const [who, fixture, category] of [
    [ha, FIXTURES.exercise, 'exercise'],
    [minh, FIXTURES.meal, 'meal'],
    [an, FIXTURES.group, 'exercise'],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await track(page, who, fixture, category);
    await context.close();
  }
});

test('the leaderboard ranks match GET /leaderboard', async ({ page, request }) => {
  await signInWeb(page, ha);
  await page.goto(`${WEB_URL}/leaderboard`);

  const token = await apiToken(ha);
  const response = await request.get(`${API_URL}/leaderboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const rows = ((await response.json()) as { leaderboard: LeaderboardRow[] }).leaderboard;
  expect(rows.length).toBe(3);

  const rendered = page.getByTestId('leaderboard-row');
  await expect(rendered).toHaveCount(rows.length);
  for (const [index, row] of rows.entries()) {
    const element = rendered.nth(index);
    await expect(element).toHaveAttribute('data-rank', String(row.rank));
    /*
     * `toContainText(String(row.total))` would be satisfied by the rank, by the weekly delta, or
     * by any digit anywhere else in the row — a total of 3 "passes" against a row showing someone
     * else's score. Each number is therefore asserted on the element that owns it, with exact
     * text; and the name goes through the row's whole-sentence aria-label, comma-bounded, so a
     * name that is a prefix of another member's cannot satisfy it.
     */
    await expect(element.getByTestId('leaderboard-total')).toHaveText(String(row.total));
    const signed = row.weekPoints >= 0 ? `+${row.weekPoints}` : String(row.weekPoints);
    await expect(element.getByTestId('leaderboard-week-delta')).toHaveText(
      new RegExp(`${signed.replace('+', '\\+')}$`),
    );
    await expect(element).toHaveAttribute('aria-label', new RegExp(`, ${row.user.displayName},`));
  }
  // Exactly one row is the signed-in member's, and it is the row the API marked.
  const me = rows.find((row) => row.isMe)!;
  const mine = page.locator('[data-testid="leaderboard-row"][data-me="true"]');
  await expect(mine).toHaveCount(1);
  await expect(mine).toHaveAttribute('aria-label', new RegExp(`, ${me.user.displayName},`));
  await expect(mine.getByTestId('leaderboard-total')).toHaveText(String(me.total));
});

test('a member detail page shows the name, the total and paged history', async ({
  page,
  request,
}) => {
  await signInWeb(page, ha);
  await page.goto(`${WEB_URL}/leaderboard`);

  /*
   * Which member the tapped row *is* has to be pinned before the click, or a detail page for the
   * wrong member reads as green. The rows carry no user id of their own (adding one would be an
   * `apps/*` change this wave may not make), so the identity comes from the API: the board is
   * rendered in the API's order — asserted rank by rank in the test above — so the first row is
   * the first row of `GET /leaderboard`, and the URL, the name and the total must all be that
   * member's.
   */
  const token = await apiToken(ha);
  const response = await request.get(`${API_URL}/leaderboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const top = ((await response.json()) as { leaderboard: LeaderboardRow[] }).leaderboard[0]!;

  const first = page.getByTestId('leaderboard-row').first();
  await expect(first).toHaveAttribute('data-rank', String(top.rank));
  await first.click();
  await page.waitForURL(`${WEB_URL}/leaderboard/${top.user.id}`);

  await expect(page.getByTestId('member-name')).toHaveText(top.user.displayName);
  await expect(page.getByTestId('member-total')).toHaveText(String(top.total));
  await expect(page.getByTestId('history-row').first()).toBeVisible();

  /*
   * The footer is rendered as soon as a page has landed, so it is the terminal state of a short
   * history as well as the paging affordance of a long one: `data-has-more` says which, and only
   * the paging case has a button to click.
   */
  const footer = page.getByTestId('history-footer');
  await expect(footer).toBeVisible();
  if ((await footer.getAttribute('data-has-more')) === 'true') {
    const before = await page.getByTestId('history-row').count();
    await footer.getByRole('button').click();
    await expect.poll(() => page.getByTestId('history-row').count()).toBeGreaterThan(before);
  }
});

test('the trends bars agree with GET /me/trends', async ({ page, request }) => {
  await signInWeb(page, ha);
  await page.goto(`${WEB_URL}/trends`);
  // The bars are a lazy chunk behind a Suspense fallback; waiting on the chart is the wait.
  await page.getByTestId('weekly-bars').waitFor({ timeout: 30_000 });

  const token = await apiToken(ha);
  const response = await request.get(`${API_URL}/me/trends`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const trends = (await response.json()) as { weeks: TrendsWeek[] };
  expect(trends.weeks.length).toBeGreaterThan(0);

  // The sr-only table is the accessible rendering of the same series — one row per week.
  const rows = page.locator('[data-testid="weekly-bars-table"] tbody tr');
  await expect(rows).toHaveCount(trends.weeks.length);
  // And the drawn bars carry the same numbers, each addressed by its own week key.
  for (const week of trends.weeks) {
    await expect(page.locator(`[data-testid="week-bar"][data-week="${week.week}"]`)).toHaveAttribute(
      'data-points',
      String(week.mine),
    );
  }
});
