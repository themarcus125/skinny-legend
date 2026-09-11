import { Hono } from 'hono';
import { and, desc, eq, lt } from 'drizzle-orm';
import { computeScore, isoWeekKey, addDays, schema, type Category, type ScoreResult, CATEGORIES } from '@skinny/shared';
import { db } from '../db.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { loadChallenge, loadConfirmedEntries, todayLocal, type Challenge } from '../services/score.js';
import { storage } from '../services/storage.js';
import { toEntryDto } from './entries.js';

type UserRow = typeof schema.users.$inferSelect;

async function userDto(u: UserRow) {
  return { id: u.id, displayName: u.displayName, avatarUrl: u.avatarKey ? await storage.publicUrl(u.avatarKey) : null };
}

async function activeUsers() {
  return db.select().from(schema.users).where(eq(schema.users.status, 'active'));
}

/** Scores for every active user as of `asOf`. Sorted by total desc, then display name. */
async function scoreboard(challenge: Challenge, asOf: string) {
  const users = await activeUsers();
  const entries = await loadConfirmedEntries(users.map((u) => u.id));
  const rows = users.map((user) => ({
    user,
    score: computeScore({ entries: entries.get(user.id) ?? [], rules: challenge.rules, challenge: challenge.config, asOf }),
  }));
  rows.sort((a, b) => b.score.total - a.score.total || a.user.displayName.localeCompare(b.user.displayName));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

function pointsInWeek(score: ScoreResult, week: string) {
  return Object.entries(score.byDay).filter(([d]) => isoWeekKey(d) === week).reduce((s, [, v]) => s + v.points, 0);
}

export const readRoutes = new Hono<AuthEnv>();
readRoutes.use(authenticate, requireActive);

readRoutes.get('/leaderboard', async (c) => {
  const me = c.get('user');
  const challenge = await loadChallenge();
  const today = todayLocal(challenge.config);
  const board = await scoreboard(challenge, today);
  const week = isoWeekKey(today);
  const leaderboard = [];
  for (const r of board) {
    leaderboard.push({ rank: r.rank, user: await userDto(r.user), total: r.score.total, weekPoints: pointsInWeek(r.score, week), isMe: r.user.id === me.id });
  }
  return c.json({ leaderboard });
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
  });
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
  return c.json({ weeks, heatmap, byCategory: mine.byCategory, streakBonus: mine.streakBonus });
});

readRoutes.get('/feed', async (c) => {
  const cursor = c.req.query('cursor');
  const where = cursor
    ? and(eq(schema.entries.status, 'confirmed'), lt(schema.entries.createdAt, new Date(cursor)))
    : eq(schema.entries.status, 'confirmed');
  const rows = await db.select({ entry: schema.entries, user: schema.users })
    .from(schema.entries).innerJoin(schema.users, eq(schema.users.id, schema.entries.userId))
    .where(where).orderBy(desc(schema.entries.createdAt)).limit(30);
  const entries = [];
  for (const { entry, user } of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, entry.id))).map((r) => r.category as Category);
    entries.push({ ...(await toEntryDto(entry, cats)), user: await userDto(user) });
  }
  const nextCursor = rows.length === 30 ? rows[rows.length - 1]!.entry.createdAt.toISOString() : null;
  return c.json({ entries, nextCursor });
});

readRoutes.get('/users/:id/entries', async (c) => {
  const rows = await db.select().from(schema.entries)
    .where(and(eq(schema.entries.userId, c.req.param('id')), eq(schema.entries.status, 'confirmed')))
    .orderBy(desc(schema.entries.takenAt)).limit(100);
  const entries = [];
  for (const row of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, row.id))).map((r) => r.category as Category);
    entries.push(await toEntryDto(row, cats));
  }
  return c.json({ entries });
});
