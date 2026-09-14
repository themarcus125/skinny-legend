import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, lt, ne } from 'drizzle-orm';
import { computeScore, isoWeekKey, schema, toLocalDate, type Category, type ConfirmedEntry, type LocalDate } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';
import { validate, uuidParam } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { storage, newKey } from '../services/storage.js';
import { classifyPhoto, type Verdict } from '../services/vision.js';
import { makeThumbnail, normalizeImage } from '../services/thumbnail.js';
import { loadChallenge, loadConfirmedEntries, todayLocal, type Challenge } from '../services/score.js';

export type EntryDeps = { classify: typeof classifyPhoto };

const categorySchema = z.enum(['exercise', 'meal', 'group']);
const placeSourceSchema = z.enum(['poi', 'geocode', 'manual', 'none']);

const createBody = z.object({
  photoKey: z.string().min(1),
  takenAt: z.string().datetime({ offset: true }),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeName: z.string().max(120).optional(),
  placeSource: placeSourceSchema.optional(),
});

const historyQuery = z.object({ cursor: z.string().datetime({ offset: true }).optional() });

/** Page size for the cursor-paginated history endpoints. */
export const HISTORY_PAGE_SIZE = 50;

/** An entry may be logged slightly ahead of the server clock (device drift, timezone rounding). */
const TAKEN_AT_FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

const patchBody = z.object({
  categories: z.array(categorySchema).max(3),
  placeName: z.string().max(120).nullable().optional(),
  placeSource: placeSourceSchema.optional(),
});

type EntryRow = typeof schema.entries.$inferSelect;

export async function toEntryDto(row: EntryRow, categories: Category[]) {
  return {
    id: row.id,
    userId: row.userId,
    photoUrl: await storage.publicUrl(row.photoKey),
    thumbUrl: row.thumbKey ? await storage.publicUrl(row.thumbKey) : null,
    takenAt: row.takenAt.toISOString(),
    localDate: row.localDate,
    status: row.status,
    categories,
    placeName: row.placeName,
    placeSource: row.placeSource,
    createdAt: row.createdAt.toISOString(),
  };
}

function toVerdictDto(v: Verdict) {
  return { categories: v.categories, healthy: v.healthy, confidence: v.confidence, reason: v.reason, model: v.model, failed: v.failed };
}

function periodKeyOf(date: LocalDate, capPeriod: 'day' | 'week'): string {
  return capPeriod === 'day' ? date : isoWeekKey(date);
}

/**
 * Points this entry would earn if confirmed with `categories`, given the user's other confirmed
 * entries. `capsHit` is computed for the entry's own day/week (not "today") by counting scored
 * rows whose entry falls in the same period as `entry.localDate` — it answers "is this category's
 * cap full for that period", which can be true even when this entry's own row still scored (an
 * earlier entry the same period filled the cap). `cappedCategories` instead reports only the
 * categories of *this entry's own* scored rows that came back with `capped: true` — i.e. this
 * entry itself scored 0 for that category — which is what a client needs to know which of an
 * entry's own categories to show a cap warning for.
 */
async function projection(challenge: Challenge, entry: EntryRow, categories: Category[], otherEntries: ConfirmedEntry[]) {
  const others = otherEntries.filter((e) => e.id !== entry.id);
  const candidate = { id: entry.id, localDate: entry.localDate, takenAt: entry.takenAt, categories };
  const combined = [...others, candidate];
  const result = computeScore({ entries: combined, rules: challenge.rules, challenge: challenge.config, asOf: todayLocal(challenge.config) });
  const ownRows = result.scored.filter((s) => s.entryId === entry.id);
  const projectedPoints = ownRows.reduce((sum, s) => sum + s.points, 0);
  const cappedCategories = ownRows.filter((s) => s.capped).map((s) => s.category);

  const dateById = new Map(combined.map((e) => [e.id, e.localDate]));
  const capsHit = { exercise: false, meal: false, group: false } as Record<Category, boolean>;
  for (const rule of challenge.rules) {
    const targetPeriod = periodKeyOf(entry.localDate, rule.capPeriod);
    const count = result.scored.filter((s) => {
      if (s.category !== rule.category || s.points <= 0) return false;
      const day = dateById.get(s.entryId);
      return day !== undefined && periodKeyOf(day, rule.capPeriod) === targetPeriod;
    }).length;
    capsHit[rule.category] = count >= rule.capCount;
  }
  return { projectedPoints, capsHit, cappedCategories };
}

async function categoriesOf(entryId: string): Promise<Category[]> {
  const rows = await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, entryId));
  return rows.map((r) => r.category);
}

export function entryRoutes(deps: EntryDeps) {
  const r = new Hono<AuthEnv>();
  r.use(authenticate, requireActive);

  r.post('/', validate('json', createBody), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    if (!body.photoKey.startsWith(`photos/${user.id}/`)) throw new ApiError(403, 'forbidden', 'Photo does not belong to you');

    const takenAt = new Date(body.takenAt);
    if (takenAt.getTime() - Date.now() > TAKEN_AT_FUTURE_TOLERANCE_MS) throw new ApiError(400, 'taken_at_future', 'takenAt is in the future');

    const challenge = await loadChallenge();
    const image = await storage.getObject(body.photoKey).catch(() => { throw new ApiError(400, 'photo_missing', 'Photo not uploaded'); });
    const normalized = await normalizeImage(image).catch(() => { throw new ApiError(400, 'photo_invalid', 'Photo could not be decoded'); });
    const [verdict, thumb] = await Promise.all([deps.classify(normalized, { locale: user.locale }), makeThumbnail(normalized)]);
    const thumbKey = newKey('thumb', user.id);
    await storage.putObject(thumbKey, thumb, 'image/jpeg');

    // The entry is confirmed straight from the verdict: the stored verdict keeps what the model
    // actually saw, while the confirmed categories drop an unhealthy meal so the member has to
    // opt in (via PATCH) rather than opt out of claiming the points. A failed verdict leaves the
    // entry pending with no categories — it scores nothing until the member picks them manually.
    const suggested = verdict.healthy === false ? verdict.categories.filter((cat) => cat !== 'meal') : verdict.categories;
    const categories = verdict.failed ? [] : [...new Set(suggested)];
    const status = verdict.failed ? ('pending' as const) : ('confirmed' as const);
    const entry = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.entries).values({
        userId: user.id,
        challengeId: challenge.id,
        photoKey: body.photoKey,
        thumbKey,
        takenAt,
        status,
        localDate: toLocalDate(takenAt, challenge.config.timezone),
        lat: body.lat,
        lng: body.lng,
        placeName: body.placeName,
        placeSource: body.placeSource ?? (body.placeName ? 'manual' : 'none'),
      }).returning();

      await tx.insert(schema.aiVerdicts).values({
        entryId: row!.id, model: verdict.model, categoriesJson: verdict.categories, healthy: verdict.healthy,
        confidence: verdict.confidence, reason: verdict.reason, rawResponse: verdict.raw, latencyMs: verdict.latencyMs, failed: verdict.failed,
      });
      if (categories.length > 0) {
        await tx.insert(schema.entryCategories).values(categories.map((category) => ({ entryId: row!.id, category, source: 'ai' as const })));
      }
      return row!;
    });

    // `projection` drops the entry's own confirmed row before re-adding it as the candidate,
    // so an auto-confirmed entry is not counted twice against its own caps.
    const others = (await loadConfirmedEntries([user.id])).get(user.id) ?? [];
    const proj = await projection(challenge, entry, categories, others);
    return c.json({ entry: await toEntryDto(entry, categories), verdict: toVerdictDto(verdict), ...proj }, 201);
  });

  r.patch('/:id', validate('param', uuidParam), validate('json', patchBody), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, c.req.valid('param').id), eq(schema.entries.userId, user.id), ne(schema.entries.status, 'rejected')));
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');

    const challenge = await loadChallenge();
    const categories = [...new Set(body.categories)];
    const [updated] = await db.transaction(async (tx) => {
      await tx.delete(schema.entryCategories).where(eq(schema.entryCategories.entryId, entry.id));
      if (categories.length > 0) await tx.insert(schema.entryCategories).values(categories.map((category) => ({ entryId: entry.id, category, source: 'user' as const })));
      return tx.update(schema.entries).set({
        status: 'confirmed',
        updatedAt: new Date(),
        ...(body.placeName !== undefined ? { placeName: body.placeName } : {}),
        ...(body.placeSource ? { placeSource: body.placeSource } : {}),
      }).where(eq(schema.entries.id, entry.id)).returning();
    });

    const others = (await loadConfirmedEntries([user.id])).get(user.id) ?? [];
    const proj = await projection(challenge, updated!, categories, others);
    return c.json({ entry: await toEntryDto(updated!, categories), ...proj });
  });

  r.delete('/:id', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const res = await db.update(schema.entries).set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(schema.entries.id, c.req.valid('param').id), eq(schema.entries.userId, user.id))).returning({ id: schema.entries.id });
    if (res.length === 0) throw new ApiError(404, 'not_found', 'Entry not found');
    return c.body(null, 204);
  });

  r.get('/mine', validate('query', historyQuery), async (c) => {
    const user = c.get('user');
    const { cursor } = c.req.valid('query');
    const challenge = await loadChallenge();
    const rows = await db.select().from(schema.entries)
      .where(and(
        eq(schema.entries.userId, user.id),
        ne(schema.entries.status, 'rejected'),
        ...(cursor ? [lt(schema.entries.takenAt, new Date(cursor))] : []),
      ))
      .orderBy(desc(schema.entries.takenAt)).limit(HISTORY_PAGE_SIZE);
    const score = computeScore({ entries: (await loadConfirmedEntries([user.id])).get(user.id) ?? [], rules: challenge.rules, challenge: challenge.config, asOf: todayLocal(challenge.config) });
    const entries = [];
    for (const row of rows) {
      const cats = await categoriesOf(row.id);
      const points = score.scored.filter((s) => s.entryId === row.id).reduce((sum, s) => sum + s.points, 0);
      const capped = score.scored.some((s) => s.entryId === row.id && s.capped);
      entries.push({ ...(await toEntryDto(row, cats)), points, capped });
    }
    const nextCursor = rows.length === HISTORY_PAGE_SIZE ? rows[rows.length - 1]!.takenAt.toISOString() : null;
    return c.json({ entries, nextCursor });
  });

  return r;
}
