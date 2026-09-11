import { describe, expect, it } from 'vitest';
import { MockAdminApi } from './mock';

describe('MockAdminApi fixtures', () => {
  it('seeds four members, exactly one of them pending', async () => {
    const users = await new MockAdminApi().listUsers();
    expect(users).toHaveLength(4);
    expect(users.filter((user) => user.status === 'pending')).toHaveLength(1);
    expect(users.filter((user) => user.role === 'admin')).toHaveLength(1);
  });

  it('returns the signed-in admin from session()', async () => {
    const me = await new MockAdminApi().session();
    expect(me).toMatchObject({ role: 'admin', status: 'active' });
  });

  it('seeds 30 entries with verdicts and newest first', async () => {
    const entries = await new MockAdminApi().listEntries({});
    expect(entries).toHaveLength(30);
    expect(entries.some((entry) => entry.verdict !== null)).toBe(true);
    expect(entries[0]!.localDate >= entries[29]!.localDate).toBe(true);
  });

  it('filters entries by status and date range', async () => {
    const api = new MockAdminApi();
    const pending = await api.listEntries({ status: 'pending' });
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((entry) => entry.status === 'pending')).toBe(true);

    const firstDay = await api.listEntries({ from: '2026-09-08', to: '2026-09-08' });
    expect(firstDay.every((entry) => entry.localDate === '2026-09-08')).toBe(true);
  });

  it('seeds the three rulebook rules and two feedback rows', async () => {
    const api = new MockAdminApi();
    const { challenge, rules } = await api.getRules();
    expect(challenge).toMatchObject({ startDate: '2026-09-08', endDate: '2026-12-25', streakPoints: 5, streakLength: 7 });
    expect(rules.map((rule) => [rule.category, rule.points, rule.capCount, rule.capPeriod])).toEqual([
      ['exercise', 3, 1, 'day'],
      ['meal', 2, 1, 'day'],
      ['group', 3, 2, 'week'],
    ]);
    await expect(api.listFeedback()).resolves.toHaveLength(2);
  });

  it('persists mutations in memory', async () => {
    const api = new MockAdminApi();
    const pending = (await api.listUsers()).find((user) => user.status === 'pending')!;
    await api.patchUser(pending.id, { status: 'active' });
    const after = (await api.listUsers()).find((user) => user.id === pending.id);
    expect(after?.status).toBe('active');

    const entry = (await api.listEntries({}))[0]!;
    await api.patchEntry(entry.id, { categories: ['meal'], status: 'confirmed' });
    const patched = (await api.listEntries({})).find((row) => row.id === entry.id);
    expect(patched).toMatchObject({ categories: ['meal'], status: 'confirmed' });

    await api.rejectEntry(entry.id);
    const rejected = (await api.listEntries({})).find((row) => row.id === entry.id);
    expect(rejected?.status).toBe('rejected');
  });
});
