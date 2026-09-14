import { Hono } from 'hono';
import { and, desc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  isoWeekKey, addDays, schema, feedQuery, mapQuery, historyQuery, CATEGORIES,
  type Category, type DashboardDto, type FeedEntryDto, type FeedResponse, type HistoryResponse,
  type LeaderboardResponse, type LeaderboardRowDto, type MapPinDto, type MapResponse,
  type ScoreResult, type TrendsResponse, type UserSummaryDto,
} from '@skinny/shared';
import { db } from '../db.js';
import { validate, uuidParam } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { loadChallenge, loadScoreboard, todayLocal } from '../services/score.js';
import { storage } from '../services/storage.js';
import { toEntryDto, HISTORY_PAGE_SIZE } from './entries.js';

type UserRow = typeof schema.users.$inferSelect;

async function userDto(u: UserRow): Promise<UserSummaryDto> {
  return { id: u.id, displayName: u.displayName, avatarUrl: u.avatarKey ? await storage.publicUrl(u.avatarKey) : null };
}

/** Scores for every active user as of `asOf`. Sorted by total desc, then display name. */
const scoreboard = loadScoreboard;

function pointsInWeek(score: ScoreResult, week: string) {
  return Object.entries(score.byDay).filter(([d]) => isoWeekKey(d) === week).reduce((s, [, v]) => s + v.points, 0);
}

export const readRoutes = new Hono<AuthEnv>();
// These routes are mounted at the app root, so the guard is scoped to their own paths:
// a blanket `use()` here would answer every unknown path with 401 instead of a 404.
for (const path of ['/leaderboard', '/me/*', '/feed', '/users/*']) {
  readRoutes.use(path, authenticate, requireActive);
}

readRoutes.get('/leaderboard', async (c) => {
  const me = c.get('user');
  const challenge = await loadChallenge();
  const today = todayLocal(challenge.config);
  const board = await scoreboard(challenge, today);
  const week = isoWeekKey(today);
  const leaderboard: LeaderboardRowDto[] = [];
  for (const r of board) {
    leaderboard.push({ rank: r.rank, user: await userDto(r.user), total: r.score.total, weekPoints: pointsInWeek(r.score, week), isMe: r.user.id === me.id });
  }
  return c.json({ leaderboard } satisfies LeaderboardResponse);
});

readRoutes.get('/me/dashboard', async (c) => {
  const me = c.get('user');
  const challenge = await loadChallenge();
  const today = todayLocal(challenge.config);
  const board = await scoreboard(challenge, today);
  const mine = board.find((r) => r.user.id === me.id)!;
  const s = mine.score;
  const todayDay = s.byDay[today] ?? { points: 0, categories: [] };
  const yesterday = s.byDay[addDays(today, -1)] ?? { points: 0, categories: [] };
  const remaining = CATEGORIES.filter((cat) => !s.capsHit[cat]);
  return c.json({
    today: todayDay,
    yesterday: { points: yesterday.points },
    deltaVsYesterday: todayDay.points - yesterday.points,
    streak: s.streak,
    total: s.total,
    rank: mine.rank,
    memberCount: board.length,
    capsHit: s.capsHit,
    remaining,
  } satisfies DashboardDto);
});

readRoutes.get('/me/trends', async (c) => {
  const me = c.get('user');
  const challenge = await loadChallenge();
  const today = todayLocal(challenge.config);
  const board = await scoreboard(challenge, today);
  const mine = board.find((r) => r.user.id === me.id)!.score;

  const weekKeys: string[] = [];
  for (let d = challenge.config.startDate; d <= today; d = addDays(d, 7)) weekKeys.push(isoWeekKey(d));
  if (!weekKeys.includes(isoWeekKey(today))) weekKeys.push(isoWeekKey(today));
  const recent = weekKeys.slice(-8);

  const weeks = recent.map((week) => {
    const perUser = board.map((r) => ({ id: r.user.id, pts: pointsInWeek(r.score, week) }));
    const minePts = perUser.find((p) => p.id === me.id)?.pts ?? 0;
    const groupAvg = perUser.length ? perUser.reduce((s, p) => s + p.pts, 0) / perUser.length : 0;
    const rank = 1 + perUser.filter((p) => p.pts > minePts).length;
    return { week, mine: minePts, groupAvg, rank };
  });

  const heatmap = Object.entries(mine.byDay).map(([date, v]) => ({ date, points: v.points })).sort((a, b) => a.date.localeCompare(b.date));
  return c.json({ weeks, heatmap, byCategory: mine.byCategory, streakBonus: mine.streakBonus } satisfies TrendsResponse);
});

readRoutes.get('/feed', validate('query', feedQuery), async (c) => {
  const { cursor } = c.req.valid('query');
  const where = cursor
    ? and(eq(schema.entries.status, 'confirmed'), lt(schema.entries.createdAt, new Date(cursor)))
    : eq(schema.entries.status, 'confirmed');
  const rows = await db.select({ entry: schema.entries, user: schema.users })
    .from(schema.entries).innerJoin(schema.users, eq(schema.users.id, schema.entries.userId))
    .where(where).orderBy(desc(schema.entries.createdAt)).limit(30);
  const entries: FeedEntryDto[] = [];
  for (const { entry, user } of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, entry.id))).map((r) => r.category as Category);
    entries.push({ ...(await toEntryDto(entry, cats)), user: await userDto(user) });
  }
  const nextCursor = rows.length === 30 ? rows[rows.length - 1]!.entry.createdAt.toISOString() : null;
  return c.json({ entries, nextCursor } satisfies FeedResponse);
});

readRoutes.get('/entries/map', validate('query', mapQuery), async (c) => {
  const { days } = c.req.valid('query');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.select({ entry: schema.entries, user: schema.users })
    .from(schema.entries).innerJoin(schema.users, eq(schema.users.id, schema.entries.userId))
    .where(and(eq(schema.entries.status, 'confirmed'), eq(schema.users.status, 'active'), isNotNull(schema.entries.lat), isNotNull(schema.entries.lng), gte(schema.entries.takenAt, since)))
    .orderBy(desc(schema.entries.takenAt)).limit(500);
  // `lat`/`lng` are nullable columns, but the query filters both to NOT NULL.
  const pins: MapPinDto[] = [];
  for (const { entry, user } of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, entry.id))).map((r) => r.category as Category);
    pins.push({ entryId: entry.id, lat: entry.lat!, lng: entry.lng!, placeName: entry.placeName, takenAt: entry.takenAt.toISOString(), localDate: entry.localDate, categories: cats, thumbUrl: entry.thumbKey ? await storage.publicUrl(entry.thumbKey) : null, user: await userDto(user) });
  }
  return c.json({ pins } satisfies MapResponse);
});

readRoutes.get('/users/:id/entries', validate('param', uuidParam), validate('query', historyQuery), async (c) => {
  const { id } = c.req.valid('param');
  const { cursor } = c.req.valid('query');
  const rows = await db.select().from(schema.entries)
    .where(and(
      eq(schema.entries.userId, id),
      eq(schema.entries.status, 'confirmed'),
      ...(cursor ? [lt(schema.entries.takenAt, new Date(cursor))] : []),
    ))
    .orderBy(desc(schema.entries.takenAt)).limit(HISTORY_PAGE_SIZE);
  const entries: HistoryResponse['entries'] = [];
  for (const row of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, row.id))).map((r) => r.category as Category);
    entries.push(await toEntryDto(row, cats));
  }
  const nextCursor = rows.length === HISTORY_PAGE_SIZE ? rows[rows.length - 1]!.takenAt.toISOString() : null;
  return c.json({ entries, nextCursor } satisfies HistoryResponse);
});
