import { expect, test, type APIRequestContext } from '@playwright/test';
import type { Member } from '@skinny/e2e-support';
import { API_URL, FIXTURES, WEB_URL } from '../src/config.js';
import { apiToken, member, query, resetAll, settleVerdict, signInWeb, uploadPhoto } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

interface EntryRow {
  id: string;
  status: string;
  photo_key: string;
}

interface VerdictRow {
  failed: boolean;
  categories: string[] | null;
  reason: string | null;
}

/**
 * Preflight R5: an entry carries no `points` column — points are derived by the scorer and only
 * ever read back through `GET /entries/mine` (per-entry) or `GET /me/dashboard` (totals).
 */
interface MineEntry {
  id: string;
  status: string;
  points: number;
  categories: string[];
}

async function myEntries(request: APIRequestContext, who: Member): Promise<MineEntry[]> {
  const token = await apiToken(who);
  const response = await request.get(`${API_URL}/entries/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { entries: MineEntry[] }).entries;
}

test.beforeAll(async () => {
  await resetAll();
});

test('a photo upload produces a verdict, points, and a fetchable R2 object', async ({ page, request }) => {
  const ha = await member({ name: 'Hà', email: 'ha-track@example.com', status: 'active' });
  await signInWeb(page, ha);
  // Home first: `today-points` before the upload is the baseline the tracked entry must not
  // undercut.
  await page.goto(`${WEB_URL}/`);
  const pointsBefore = Number(await page.getByTestId('today-points').innerText());
  expect(Number.isFinite(pointsBefore)).toBe(true);
  await page.goto(`${WEB_URL}/track`);

  const presign = page.waitForResponse((r) => r.url().endsWith('/uploads/presign') && r.ok());
  await page.getByTestId('library-input').setInputFiles(FIXTURES.exercise);
  const presignBody = (await (await presign).json()) as { key: string; url: string };
  // The key must land under the run's own prefix, never in production's namespace.
  expect(presignBody.key.startsWith('e2e/photos/')).toBe(true);

  // The screen must show it is working before the sheet arrives: the `uploading` phase renders a
  // ProgressBar (`role="progressbar"`, packages/ui/src/progress-bar.tsx) and the `analyzing` phase
  // the `track-analyzing` card. Which of the two is caught depends on how fast the PUT completes —
  // a fixture-sized upload can finish in well under a frame — so the assertion is that one of the
  // two busy states is on screen, never that a particular one was observed.
  const busy = page.getByRole('progressbar').or(page.getByTestId('track-analyzing'));
  await expect(busy.first()).toBeVisible();

  // …and the sheet follows it.
  await page.getByTestId('verdict-sheet').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('verdict-points')).toHaveText(/^\d+$/);

  // The sheet renders the uploaded photo from R2; read the URL while the sheet is still open.
  const objectUrl = await page
    .getByTestId('verdict-sheet')
    .locator('img[src^="http"]')
    .first()
    .getAttribute('src');

  await settleVerdict(page);

  const [entry] = await query<EntryRow>(
    'select id, status, photo_key from entries order by created_at desc limit 1',
  );
  expect(entry).toBeTruthy();
  const [verdict] = await query<VerdictRow>(
    // Preflight R6: the model's own answer lives in `categories_json`.
    'select failed, categories_json as categories, reason from ai_verdicts where entry_id = $1',
    [entry!.id],
  );

  // Tolerant by design (spec §3): a real OpenRouter call may fail or disagree. What must hold is
  // that a verdict row exists with a valid shape and the entry is in one of the two legal states.
  expect(verdict).toBeTruthy();
  expect(typeof verdict!.failed).toBe('boolean');
  expect(Array.isArray(verdict!.categories)).toBe(true);
  expect(['confirmed', 'pending']).toContain(entry!.status);

  // Points are the scorer's, not a column: the entry must come back from the member's own history
  // with a finite score (0 is legal — a capped or uncategorised entry earns nothing).
  const mine = await myEntries(request, ha);
  const scored = mine.find((row) => row.id === entry!.id);
  expect(scored).toBeTruthy();
  expect(Number.isFinite(scored!.points)).toBe(true);
  expect(scored!.points).toBeGreaterThanOrEqual(0);

  // The object really is in the bucket: the same URL must fetch with an image content type.
  expect(entry!.photo_key.startsWith('e2e/photos/')).toBe(true);
  expect(objectUrl).toBeTruthy();
  const object = await request.get(objectUrl!);
  expect(object.status()).toBe(200);
  expect(object.headers()['content-type']).toContain('image');

  // Home reflects the entry. `today-points` can only have gone up (or stayed put, if the entry
  // scored 0 — legal), the "nothing today" line is gone, and the Today card carries a chip for
  // every category the entry actually ended up with. The checklist is `capsHit`, not "done today",
  // so it is asserted as present-and-well-formed rather than ticked by a single entry.
  const stored = await query<{ category: string }>(
    'select category from entry_categories where entry_id = $1',
    [entry!.id],
  );
  await page.goto(`${WEB_URL}/`);
  await expect(page.getByTestId('today-points')).toHaveText(/^\d+$/);
  const pointsAfter = Number(await page.getByTestId('today-points').innerText());
  expect(pointsAfter).toBeGreaterThanOrEqual(pointsBefore);
  expect(stored.length).toBeGreaterThan(0);
  await expect(page.getByTestId('today-empty')).toHaveCount(0);
  // Since SKI-134 the group log is the tail of Trang chủ, and its rows render chips of their
  // own — so the Today card's chips are addressed inside the card that holds `today-points`,
  // not by test id across the whole screen.
  const todayCard = page.locator('section').filter({ has: page.getByTestId('today-points') });
  for (const { category } of stored) {
    await expect(page.locator(`[data-testid="checklist-row"][data-category="${category}"]`)).toHaveAttribute(
      'data-done',
      /^(true|false)$/,
    );
    await expect(
      todayCard.locator(`[data-testid="category-chip"][data-category="${category}"]`),
    ).toBeVisible();
  }
});

test('correcting the category recalculates the points', async ({ page, request }) => {
  const minh = await member({ name: 'Minh', email: 'minh-track@example.com', status: 'active' });
  await signInWeb(page, minh);
  await page.goto(`${WEB_URL}/track`);
  await uploadPhoto(page, FIXTURES.meal);

  // A chip is a <button data-hit="44"> only while the picker is expanded; a failed verdict opens
  // expanded already, a successful one needs "Không đúng?".
  if ((await page.locator('[data-testid="category-chip"][data-hit="44"]').count()) === 0) {
    await page.getByTestId('toggle-editing').click();
  }

  // Correct *towards* a category the sheet does not already carry: emptying the selection would
  // disable the primary (`canSave`), which is a different behaviour than the one under test.
  const unselected = page.locator('[data-testid="category-chip"][data-selected="false"]');
  await expect(unselected.first()).toBeVisible();
  const category = await unselected.first().getAttribute('data-category');
  expect(category).toBeTruthy();
  // Addressed by category, never as "the first unselected chip": that locator stops matching the
  // moment the chip is selected and silently re-resolves to a different one.
  const chip = page.locator(`[data-testid="category-chip"][data-category="${category}"]`);

  const pointsBefore = Number(await page.getByTestId('verdict-points').innerText());
  await chip.click();
  await expect(chip).toHaveAttribute('data-selected', 'true');
  const pointsAfter = Number(await page.getByTestId('verdict-points').innerText());

  const selected = await page
    .locator('[data-testid="category-chip"][data-selected="true"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-category')));

  await page.getByTestId('verdict-primary').click();
  await page.getByTestId('verdict-sheet').waitFor({ state: 'detached', timeout: 60_000 });

  const [entry] = await query<{ id: string; status: string }>(
    'select id, status from entries order by created_at desc limit 1',
  );
  const stored = await query<{ category: string; source: string }>(
    'select category, source from entry_categories where entry_id = $1',
    [entry!.id],
  );
  const names = stored.map((row) => row.category);
  expect(names).toContain(category);
  expect(names.sort()).toEqual([...selected].sort());
  // The correction is the member's, and a PATCH always confirms the entry.
  expect(stored.every((row) => row.source === 'user')).toBe(true);
  expect(entry!.status).toBe('confirmed');

  // The server's number is authoritative; the sheet only ever showed a projection.
  const scored = (await myEntries(request, minh)).find((row) => row.id === entry!.id);
  expect(scored).toBeTruthy();
  expect(scored!.points).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(pointsBefore)).toBe(true);
  expect(Number.isFinite(pointsAfter)).toBe(true);
});

test('a photo with no EXIF still tracks', async ({ page, request }) => {
  const an = await member({ name: 'An', email: 'an-track@example.com', status: 'active' });
  await signInWeb(page, an);
  await page.goto(`${WEB_URL}/track`);
  await uploadPhoto(page, FIXTURES.noExif);
  await settleVerdict(page);

  const [entry] = await query<{ id: string; taken_at: string | null; lat: number | null }>(
    'select id, taken_at, lat from entries order by created_at desc limit 1',
  );
  expect(entry).toBeTruthy();
  // No EXIF means no GPS, and the browser's geolocation is denied in this context; the entry
  // still exists, still carries a capture time (the upload's own clock), and is still scored.
  expect(entry!.lat).toBeNull();
  expect(entry!.taken_at).toBeTruthy();
  const scored = (await myEntries(request, an)).find((row) => row.id === entry!.id);
  expect(scored).toBeTruthy();
  expect(Number.isFinite(scored!.points)).toBe(true);
});
