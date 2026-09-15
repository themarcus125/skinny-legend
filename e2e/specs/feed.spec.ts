import { expect, test, type Page } from '@playwright/test';
import type { Member } from '@skinny/e2e-support';
import { FIXTURES, WEB_URL } from '../src/config.js';
import { member, query, resetAll, settleVerdict, signInWeb, uploadPhoto } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

/**
 * A place name is never derived for the member: `POST /entries` stores what the sheet sent, and
 * the sheet only sends a name the member picked from Nominatim or typed. Typing one is therefore
 * the only way a run can *depend* on a row having a location button — a live Nominatim may be
 * rate-limited, and spec §3 keeps that legal.
 */
const PLACES = { ha: 'Sân E2E', minh: 'Quán E2E' } as const;

interface LocatedEntry {
  id: string;
  name: string;
}

let ha: Member;
let minh: Member;

/** Uploads a fixture, names the place by hand, and settles the sheet so the entry is confirmed. */
async function track(page: Page, who: Member, fixture: string, place: string): Promise<void> {
  await signInWeb(page, who);
  await page.goto(`${WEB_URL}/track`);
  await uploadPhoto(page, fixture);
  await page.getByTestId('place-manual').fill(place);
  // A live OpenRouter call may come back `failed`; `settleVerdict` picks a category when the
  // primary is disabled, which is what turns a pending entry into a confirmed, scored one.
  await settleVerdict(page, 'exercise');
}

test.beforeAll(async ({ browser }) => {
  await resetAll();
  ha = await member({ name: 'Hà', email: 'ha-feed@example.com', status: 'active' });
  minh = await member({ name: 'Minh', email: 'minh-feed@example.com', status: 'active' });

  for (const [who, fixture, place] of [
    [ha, FIXTURES.exercise, PLACES.ha],
    [minh, FIXTURES.group, PLACES.minh],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await track(page, who, fixture, place);
    await context.close();
  }
});

test('the home feed groups both members entries under a day heading', async ({ page }) => {
  await signInWeb(page, ha);
  // The group log folded into Trang chủ (SKI-134); `/feed` is now a redirect to it.
  await page.goto(`${WEB_URL}/feed`);
  await page.waitForURL(`${WEB_URL}/`);
  await page.getByTestId('feed-row').first().waitFor({ timeout: 30_000 });

  await expect(page.getByTestId('feed-section')).toBeVisible();
  await expect(page.getByTestId('feed-day')).toHaveCount(1);
  await expect(page.getByTestId('feed-row')).toHaveCount(2);
  const day = await page.getByTestId('feed-day').first().getAttribute('data-date');
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Both members' entries are in the group's log, each row addressed by its own entry id.
  const entries = await query<LocatedEntry>(
    'select e.id, u.display_name as name from entries e join users u on u.id = e.user_id',
  );
  expect(entries.length).toBe(2);
  for (const entry of entries) {
    await expect(page.locator(`[data-testid="feed-row"][data-entry-id="${entry.id}"]`)).toContainText(
      entry.name,
    );
  }
});

test('a row location button opens the map on that entry, with every pin drawn', async ({ page }) => {
  const located = await query<LocatedEntry>(
    'select e.id, u.display_name as name from entries e join users u on u.id = e.user_id where e.lat is not null',
  );
  expect(located.length).toBe(2);
  const mine = located.find((entry) => entry.name === 'Hà')!;

  await signInWeb(page, ha);
  await page.goto(`${WEB_URL}/`);
  await page.getByTestId('feed-row').first().waitFor({ timeout: 30_000 });

  // The place name *is* the control: a real button that says what the tap does.
  const location = page.locator(`[data-testid="feed-place"][data-entry-id="${mine.id}"]`);
  await expect(location).toHaveAttribute('aria-label', /trên bản đồ/);
  await expect(location).toHaveRole('button');
  await location.click();
  await page.waitForURL(`${WEB_URL}/feed/map?entry=${mine.id}`);

  // The tapped entry's card opens by itself; the fixtures sit hundreds of metres apart, well
  // outside the 50 m cluster radius, so every entry keeps a marker of its own.
  await expect(page.locator(`[data-testid="pin-card"][data-entry-id="${mine.id}"]`)).toBeVisible();
  await expect(page.getByTestId('pin-place')).toContainText(PLACES.ha);
  const markers = page.locator('.leaflet-marker-icon');
  await expect(markers).toHaveCount(located.length);
  for (const entry of located) {
    await expect(page.locator(`.leaflet-marker-icon[aria-label*="${entry.name}"]`)).toHaveCount(1);
  }
});

test('the track screen offers a real Nominatim place or the manual fallback', async ({ page }) => {
  const an = await member({ name: 'An', email: 'an-feed@example.com', status: 'active' });
  await signInWeb(page, an);
  await page.goto(`${WEB_URL}/track`);
  await uploadPhoto(page, FIXTURES.meal);

  const chip = page.getByTestId('place-chip');
  await chip.waitFor({ timeout: 30_000 });
  const option = page.getByTestId('place-option').first();
  const none = page.getByTestId('place-none');
  const manual = page.getByTestId('place-manual');

  /*
   * Tolerant by design (spec §3 and §5): Nominatim may rate-limit or simply know nothing around
   * the fixture's coordinates, in which case "nothing nearby" plus the manual field is the
   * correct rendering. Both are terminal states of the same query, so polling for either is the
   * wait — no fixed sleep, and no assertion on which one a live service produced.
   */
  await expect
    .poll(async () => (await option.count()) > 0 || (await none.count()) > 0, { timeout: 30_000 })
    .toBe(true);

  if ((await option.count()) > 0) {
    await expect(option).toContainText(/\S/);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  } else {
    await expect(none).toBeVisible();
    await manual.fill('Quán tay');
    await expect(manual).toHaveValue('Quán tay');
  }
});
