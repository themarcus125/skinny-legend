import type { LocalDate } from '../dates.js';
import { renderNotification } from './templates.js';
import type {
  LeaderboardStanding,
  NotificationKind,
  NotificationVars,
  PlanInput,
  Planned,
  PlannerUser,
} from './types.js';

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Spec §E: only a gap of exactly 1, 3 or 7 days triggers an inactivity reminder. */
const INACTIVE_BY_GAP: Record<number, NotificationKind | undefined> = {
  1: 'inactive_1d',
  3: 'inactive_3d',
  7: 'inactive_7d',
};
const RANK_NUDGE_MIN_RANK = 2;
const RANK_NUDGE_MAX_RANK = 5;
const RANK_NUDGE_MAX_GAP = 15;

interface Candidate {
  kind: NotificationKind;
  vars: NotificationVars;
}

/**
 * Whole calendar days between two challenge-local dates. Both are `YYYY-MM-DD` already in
 * Asia/Ho_Chi_Minh, so they are compared as UTC midnights: no timezone maths, no DST drift.
 */
function dayGap(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

function inactivityFor(user: PlannerUser, today: LocalDate): Candidate | null {
  if (user.lastConfirmedDate === null) return null;
  const gap = dayGap(user.lastConfirmedDate, today);
  const kind = INACTIVE_BY_GAP[gap];
  return kind ? { kind, vars: { days: gap } } : null;
}

function rankNudgeFor(user: PlannerUser, standings: LeaderboardStanding[]): Candidate | null {
  if (user.rank < RANK_NUDGE_MIN_RANK || user.rank > RANK_NUDGE_MAX_RANK) return null;
  // standings is sorted by total descending, so the LAST row still above the user is the
  // nearest one — the first row would be the overall leader.
  const above = standings.filter((s) => s.total > user.total);
  const next = above[above.length - 1];
  if (!next) return null;
  const gap = next.total - user.total;
  if (gap > RANK_NUDGE_MAX_GAP) return null;

  const vars: NotificationVars = { gap, name: next.displayName };
  if (user.rank > 2) {
    const gapToTop = (standings[0]?.total ?? user.total) - user.total;
    if (gapToTop > 0) vars.gapToTop = gapToTop;
  }
  return { kind: 'rank_nudge', vars };
}

/**
 * Pure reminder planner (spec §E). No I/O, no clock: everything it needs is in `input`.
 * At most one notification per user per run — inactivity outranks a rank nudge, because two
 * pushes arriving in the same second reads as spam.
 */
export function planNotifications(input: PlanInput): Planned[] {
  const { users, leaderboard, log, today, now, challenge } = input;
  if (today > challenge.endDate) return [];

  const standings = [...leaderboard].sort((a, b) => b.total - a.total || a.rank - b.rank);
  const recent = new Set(
    log
      .filter((e) => now.getTime() - e.sentAt.getTime() < DEDUPE_WINDOW_MS)
      .map((e) => `${e.userId}:${e.kind}`),
  );

  const planned: Planned[] = [];
  for (const user of users) {
    const candidate = inactivityFor(user, today) ?? rankNudgeFor(user, standings);
    if (!candidate) continue;
    if (recent.has(`${user.userId}:${candidate.kind}`)) continue;
    const { title, body } = renderNotification(candidate.kind, user.locale, candidate.vars);
    planned.push({
      userId: user.userId,
      kind: candidate.kind,
      locale: user.locale,
      title,
      body,
      vars: candidate.vars,
    });
  }
  return planned;
}
