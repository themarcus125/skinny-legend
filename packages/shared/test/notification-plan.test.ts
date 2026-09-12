import { describe, it, expect } from 'vitest';
import { planNotifications } from '../src/notifications/plan.js';
import type { LeaderboardStanding, NotificationKind, NotificationLogEntry, PlannerUser } from '../src/notifications/types.js';
import type { ChallengeConfig } from '../src/scoring/types.js';

const challenge: ChallengeConfig = {
  startDate: '2026-09-08',
  endDate: '2026-12-25',
  timezone: 'Asia/Ho_Chi_Minh',
  streakPoints: 5,
  streakLength: 7,
};
const TODAY = '2026-09-20';
const NOW = new Date('2026-09-20T13:00:00Z'); // 20:00 ICT, the cron instant

/** Four members, 6 points apart, so every rank has a ≤15 gap to the one above. */
const BOARD: LeaderboardStanding[] = [
  { userId: 'u1', displayName: 'Khoa', rank: 1, total: 40 },
  { userId: 'u2', displayName: 'Minh', rank: 2, total: 34 },
  { userId: 'u3', displayName: 'Lan', rank: 3, total: 28 },
  { userId: 'u4', displayName: 'Tuấn', rank: 4, total: 22 },
];

function user(over: Partial<PlannerUser> & { userId: string }): PlannerUser {
  const standing = BOARD.find((s) => s.userId === over.userId);
  return {
    lastConfirmedDate: TODAY,
    rank: standing?.rank ?? 1,
    total: standing?.total ?? 0,
    locale: 'vi',
    ...over,
  };
}

function plan(users: PlannerUser[], log: NotificationLogEntry[] = [], over: Partial<{ today: string; now: Date }> = {}) {
  return planNotifications({
    users,
    leaderboard: BOARD,
    log,
    today: over.today ?? TODAY,
    now: over.now ?? NOW,
    challenge,
  });
}

describe('planNotifications — inactivity', () => {
  const cases: Array<{ lastConfirmedDate: string | null; expected: NotificationKind | null }> = [
    { lastConfirmedDate: '2026-09-20', expected: null },        // logged today
    { lastConfirmedDate: '2026-09-19', expected: 'inactive_1d' },
    { lastConfirmedDate: '2026-09-18', expected: null },        // gap 2 is not a trigger
    { lastConfirmedDate: '2026-09-17', expected: 'inactive_3d' },
    { lastConfirmedDate: '2026-09-16', expected: null },        // gap 4
    { lastConfirmedDate: '2026-09-13', expected: 'inactive_7d' },
    { lastConfirmedDate: '2026-09-12', expected: null },        // gap 8, past every trigger
    { lastConfirmedDate: null, expected: null },                // never logged: no gap to measure
  ];

  for (const { lastConfirmedDate, expected } of cases) {
    it(`last confirmed ${lastConfirmedDate ?? 'never'} -> ${expected ?? 'nothing'}`, () => {
      // u1 is rank 1, so a rank_nudge can never mask the inactivity result.
      const out = plan([user({ userId: 'u1', lastConfirmedDate })]);
      expect(out.map((p) => p.kind)).toEqual(expected ? [expected] : []);
    });
  }

  it('renders the planned copy in the user locale', () => {
    const [vi] = plan([user({ userId: 'u1', lastConfirmedDate: '2026-09-19' })]);
    const [en] = plan([user({ userId: 'u1', lastConfirmedDate: '2026-09-19', locale: 'en' })]);
    expect(vi!.locale).toBe('vi');
    expect(en!.locale).toBe('en');
    expect(vi!.body).not.toBe(en!.body);
    expect(vi!.vars).toEqual({ days: 1 });
  });
});

describe('planNotifications — rank nudge', () => {
  it('nudges rank 2 with no lead sentence', () => {
    const [p] = plan([user({ userId: 'u2' })]);
    expect(p!.kind).toBe('rank_nudge');
    expect(p!.vars).toEqual({ gap: 6, name: 'Khoa' });
    expect(p!.body).toBe('Còn 6 điểm là vượt Khoa.');
  });

  it('nudges rank 3 with the gap to the top as well', () => {
    const [p] = plan([user({ userId: 'u3' })]);
    expect(p!.vars).toEqual({ gap: 6, name: 'Minh', gapToTop: 12 });
    expect(p!.body).toBe('Còn 6 điểm là vượt Minh. 12 điểm nữa để dẫn đầu.');
  });

  it('never nudges rank 1', () => {
    expect(plan([user({ userId: 'u1' })])).toEqual([]);
  });

  it('never nudges beyond rank 5', () => {
    const board: LeaderboardStanding[] = [
      { userId: 'a', displayName: 'A', rank: 1, total: 30 },
      { userId: 'b', displayName: 'B', rank: 2, total: 28 },
      { userId: 'c', displayName: 'C', rank: 3, total: 26 },
      { userId: 'd', displayName: 'D', rank: 4, total: 24 },
      { userId: 'e', displayName: 'E', rank: 5, total: 22 },
      { userId: 'f', displayName: 'F', rank: 6, total: 20 },
    ];
    const out = planNotifications({
      users: [{ userId: 'f', lastConfirmedDate: TODAY, rank: 6, total: 20, locale: 'vi' }],
      leaderboard: board, log: [], today: TODAY, now: NOW, challenge,
    });
    expect(out).toEqual([]);
  });

  it('does not nudge when the gap to the next rank is more than 15 points', () => {
    const board: LeaderboardStanding[] = [
      { userId: 'a', displayName: 'A', rank: 1, total: 40 },
      { userId: 'b', displayName: 'B', rank: 2, total: 24 }, // gap 16
    ];
    const out = planNotifications({
      users: [{ userId: 'b', lastConfirmedDate: TODAY, rank: 2, total: 24, locale: 'vi' }],
      leaderboard: board, log: [], today: TODAY, now: NOW, challenge,
    });
    expect(out).toEqual([]);
  });

  it('nudges at exactly a 15 point gap', () => {
    const board: LeaderboardStanding[] = [
      { userId: 'a', displayName: 'A', rank: 1, total: 40 },
      { userId: 'b', displayName: 'B', rank: 2, total: 25 },
    ];
    const out = planNotifications({
      users: [{ userId: 'b', lastConfirmedDate: TODAY, rank: 2, total: 25, locale: 'vi' }],
      leaderboard: board, log: [], today: TODAY, now: NOW, challenge,
    });
    expect(out.map((p) => p.vars.gap)).toEqual([15]);
  });

  it('measures the gap against the nearest member above, not the leader', () => {
    // u4 is rank 4; the nearest above is Lan (28), not Khoa (40).
    const [p] = plan([user({ userId: 'u4' })]);
    expect(p!.vars).toEqual({ gap: 6, name: 'Lan', gapToTop: 18 });
  });
});

describe('planNotifications — precedence, dedupe and window', () => {
  it('prefers inactivity over a rank nudge for the same user', () => {
    const out = plan([user({ userId: 'u2', lastConfirmedDate: '2026-09-17' })]);
    expect(out.map((p) => p.kind)).toEqual(['inactive_3d']);
  });

  it('drops a kind already sent to that user inside 24 h', () => {
    const log: NotificationLogEntry[] = [
      { userId: 'u2', kind: 'rank_nudge', sentAt: new Date('2026-09-19T13:00:30Z') },
    ];
    expect(plan([user({ userId: 'u2' })], log)).toEqual([]);
  });

  it('allows the same kind again once 24 h have passed', () => {
    const log: NotificationLogEntry[] = [
      { userId: 'u2', kind: 'rank_nudge', sentAt: new Date('2026-09-19T12:59:00Z') },
    ];
    expect(plan([user({ userId: 'u2' })], log).map((p) => p.kind)).toEqual(['rank_nudge']);
  });

  it('dedupes per kind, not per user', () => {
    const log: NotificationLogEntry[] = [
      { userId: 'u2', kind: 'inactive_1d', sentAt: new Date('2026-09-20T02:00:00Z') },
    ];
    expect(plan([user({ userId: 'u2' })], log).map((p) => p.kind)).toEqual(['rank_nudge']);
  });

  it('ignores log rows belonging to another user', () => {
    const log: NotificationLogEntry[] = [
      { userId: 'u3', kind: 'rank_nudge', sentAt: new Date('2026-09-20T02:00:00Z') },
    ];
    expect(plan([user({ userId: 'u2' })], log).map((p) => p.kind)).toEqual(['rank_nudge']);
  });

  it('plans nothing at all after the challenge end date', () => {
    const out = plan([user({ userId: 'u2' }), user({ userId: 'u3' })], [], { today: '2026-12-26' });
    expect(out).toEqual([]);
  });

  it('still plans on the end date itself', () => {
    const out = plan([user({ userId: 'u2' })], [], { today: '2026-12-25' });
    expect(out.map((p) => p.kind)).toEqual(['rank_nudge']);
  });

  it('returns one entry per matching user, in input order', () => {
    const out = plan([
      user({ userId: 'u2' }),
      user({ userId: 'u1' }),                                  // rank 1, nothing
      user({ userId: 'u3', lastConfirmedDate: '2026-09-19' }),
    ]);
    expect(out.map((p) => [p.userId, p.kind])).toEqual([
      ['u2', 'rank_nudge'],
      ['u3', 'inactive_1d'],
    ]);
  });
});
