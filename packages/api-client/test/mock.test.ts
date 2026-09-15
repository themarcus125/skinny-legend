import { describe, it, expect } from 'vitest';
import { createMockApiClient, makeAdminSeed, makeSeed } from '../src/index';

/** A Monday inside the challenge window, so the seeded weekday patterns are pinned. */
const TODAY = '2026-09-14';
const fixed = () => createMockApiClient({ seed: makeSeed(TODAY), latencyMs: 0 });

describe('mock client', () => {
  it('is deterministic for a fixed today', () => {
    expect(makeSeed(TODAY)).toEqual(makeSeed(TODAY));
  });

  it('seeds five active members with me among them', async () => {
    const api = fixed();
    const board = await api.leaderboard();
    expect(board).toHaveLength(5);
    expect(board.filter((row) => row.isMe)).toHaveLength(1);
    expect(api.seed.me.displayName).toBe('Khoa');
  });

  it('ranks like the server: ties share a rank and the sequence skips', async () => {
    const api = fixed();
    const board = await api.leaderboard();
    // The rotated weekday patterns hand two members 46 points and three of them 43, so the
    // seed itself produces the tie. Competition ranking (apps/api/src/services/score.ts:71)
    // is `1 + the number of members strictly ahead`, never a positional index.
    expect(board.map((row) => [row.user.displayName, row.total, row.rank])).toEqual([
      ['Linh', 46, 1],
      ['Tuấn', 46, 1],
      ['Đức', 43, 3],
      ['Khoa', 43, 3],
      ['Mai', 43, 3],
    ]);
    // Presentation order stays points desc, then display name.
    expect(board.map((row) => row.total)).toEqual([...board.map((row) => row.total)].sort((a, b) => b - a));
    // The dashboard reads the same scoreboard, so `me` gets the same shared rank.
    const dashboard = await api.dashboard();
    expect(dashboard.rank).toBe(3);
    expect(dashboard.total).toBe(43);
    expect(dashboard.memberCount).toBe(5);
  });

  it('anchors mapPins to the seed day, not the wall clock', async () => {
    // A seed day well away from "now": with a Date.now() window these pins would all fall out.
    const api = createMockApiClient({ seed: makeSeed('2026-09-08'), latencyMs: 0 });
    const pins = await api.mapPins(1);
    expect(pins).toHaveLength(8);
    expect(pins.every((pin) => pin.localDate === '2026-09-08')).toBe(true);
    expect(pins.every((pin) => pin.lat !== null && pin.lng !== null)).toBe(true);
    // days=0 is the seed day alone, and nothing is dated before the window opens.
    expect(await api.mapPins(0)).toHaveLength(8);
  });

  it('fails every fifth verdict, leaving the entry pending with no categories', async () => {
    const api = fixed();
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(
        await api.createEntry({ photoKey: `photos/me/${i}.jpg`, takenAt: `${TODAY}T09:0${i}:00+07:00` }),
      );
    }
    const failed = results.filter((r) => r.verdict?.failed);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.entry.status).toBe('pending');
    expect(failed[0]!.entry.categories).toEqual([]);
    // Every entry waits as pending for the member's confirmation; a usable verdict only differs
    // by carrying its suggested categories.
    expect(results.every((r) => r.entry.status === 'pending')).toBe(true);
    expect(results.filter((r) => r.entry.categories.length > 0)).toHaveLength(4);
  });

  /**
   * Burns counters 1-4 on a day before the challenge starts, so `computeScore` filters them out
   * and they cannot spend any cap. The fifth verdict is the failing one (`counter % 5 === 0`).
   */
  async function pendingEntryOn(api: ReturnType<typeof fixed>, day: string) {
    for (let i = 0; i < 4; i += 1) {
      await api.createEntry({ photoKey: `photos/me/warm-${i}.jpg`, takenAt: '2026-09-01T09:00:00+07:00' });
    }
    const created = await api.createEntry({ photoKey: 'photos/me/a.jpg', takenAt: `${day}T09:00:00+07:00` });
    expect(created.verdict?.failed).toBe(true);
    expect(created.entry.status).toBe('pending');
    return created;
  }

  it('confirms a pending entry through confirmEntry and returns a real projection', async () => {
    const api = fixed();
    const created = await pendingEntryOn(api, TODAY);
    // `group` has a 2-per-week cap and 2026-09-14 is the Monday that opens a fresh ISO week,
    // so the rulebook's 3 points are still there to be earned.
    const patched = await api.confirmEntry(created.entry.id, { categories: ['group'] });
    expect(patched.entry.status).toBe('confirmed');
    expect(patched.entry.categories).toEqual(['group']);
    expect(patched.projectedPoints).toBe(3);
    expect(patched.cappedCategories).toEqual([]);
  });

  it('projects zero for a category whose daily cap the seed already spent', async () => {
    const api = fixed();
    const created = await pendingEntryOn(api, TODAY);
    // The seed already books a morning `exercise` entry for me on this Monday.
    const patched = await api.confirmEntry(created.entry.id, { categories: ['exercise'] });
    expect(patched.projectedPoints).toBe(0);
    expect(patched.cappedCategories).toEqual(['exercise']);
    expect(patched.capsHit.exercise).toBe(true);
  });

  it('serves nearby places from the seeded HCMC table', async () => {
    const { places, attribution } = await fixed().nearbyPlaces(10.7769, 106.7009);
    expect(places[0]!.name).toBe('Phòng gym California Fitness');
    expect(places[0]!.distanceM).toBe(0);
    expect(places.length).toBeLessThanOrEqual(8);
    expect(attribution).toBe('© OpenStreetMap contributors');
  });

  it('paginates history with a cursor', async () => {
    const api = createMockApiClient({ seed: makeSeed(TODAY), latencyMs: 0, historyPageSize: 10 });
    const first = await api.myEntries();
    expect(first.entries).toHaveLength(10);
    expect(first.nextCursor).not.toBeNull();
    const second = await api.myEntries(first.nextCursor!);
    expect(second.entries[0]!.id).not.toBe(first.entries[0]!.id);
    expect(second.entries.map((e) => e.id)).not.toContain(first.entries[0]!.id);
  });

  it('reset() restores the seed after mutations', async () => {
    const api = fixed();
    const before = (await api.myEntries()).entries.length;
    await api.createEntry({ photoKey: 'photos/me/x.jpg', takenAt: `${TODAY}T09:00:00+07:00` });
    expect((await api.myEntries()).entries.length).toBe(before + 1);
    api.reset();
    expect((await api.myEntries()).entries.length).toBe(before);
  });

  it('scores the dashboard and trends off the shared rulebook', async () => {
    const api = fixed();
    const dashboard = await api.dashboard();
    expect(dashboard.memberCount).toBe(5);
    expect(dashboard.rank).toBeGreaterThanOrEqual(1);
    expect(dashboard.total).toBeGreaterThan(0);
    expect(dashboard.streak.current).toBeGreaterThan(0);

    const trends = await api.trends();
    expect(trends.weeks.length).toBeGreaterThan(0);
    expect(trends.weeks.length).toBeLessThanOrEqual(8);
    expect(trends.heatmap.map((d) => d.date)).toEqual([...trends.heatmap.map((d) => d.date)].sort());
  });

  it('serves the admin fixture unchanged when seeded with makeAdminSeed()', async () => {
    const api = createMockApiClient({ seed: makeAdminSeed(), latencyMs: 0 });
    await expect(api.listUsers()).resolves.toHaveLength(4);
    const entries = await api.listEntries({});
    expect(entries).toHaveLength(30);
    expect(entries.filter((entry) => entry.status === 'pending')).toHaveLength(1);
    await expect(api.listFeedback()).resolves.toHaveLength(2);
    await expect(api.listNotifications()).resolves.toHaveLength(3);
    const { rules } = await api.getRules();
    expect(rules.map((rule) => [rule.category, rule.points, rule.capCount, rule.capPeriod])).toEqual([
      ['exercise', 3, 1, 'day'],
      ['meal', 2, 1, 'day'],
      ['group', 3, 2, 'week'],
    ]);
  });

  it('resolves uploadToPresign and reports completion', async () => {
    const api = fixed();
    const seen: number[] = [];
    await expect(
      api.uploadToPresign('mock://upload/photos/x.jpg', new Blob(['x']), 'image/jpeg', (f) => seen.push(f)),
    ).resolves.toBeUndefined();
    expect(seen).toEqual([1]);
  });

  it('registers and unregisters push devices', async () => {
    const api = fixed();
    await api.registerDevice({ token: 'tok-1', platform: 'ios', locale: 'vi' });
    await api.registerDevice({ token: 'tok-2', platform: 'ios', locale: 'en' });
    expect(api.registeredTokens()).toEqual(['tok-1', 'tok-2']);
    await api.unregisterDevice('tok-1');
    expect(api.registeredTokens()).toEqual(['tok-2']);
  });

  it('rejects a deleted entry and 404s on an unknown id', async () => {
    const api = fixed();
    const mine = (await api.myEntries()).entries[0]!;
    await api.deleteEntry(mine.id);
    expect((await api.myEntries()).entries.map((e) => e.id)).not.toContain(mine.id);
    expect((await api.feed()).entries.map((e) => e.id)).not.toContain(mine.id);
    await expect(api.deleteEntry('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});
