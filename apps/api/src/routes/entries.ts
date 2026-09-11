import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ne } from 'drizzle-orm';
import { computeScore, schema, toLocalDate, type Category } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';
import { validate } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { storage, newKey } from '../services/storage.js';
import { classifyPhoto, type Verdict } from '../services/vision.js';
import { makeThumbnail, normalizeImage } from '../services/thumbnail.js';
import { loadChallenge, loadConfirmedEntries, todayLocal } from '../services/score.js';

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

/** Points this entry would earn if confirmed with `categories`, given the user's other confirmed entries. */
async function projection(userId: string, entry: EntryRow, categories: Category[]) {
  const challenge = await loadChallenge();
  const others = ((await loadConfirmedEntries([userId])).get(userId) ?? []).filter((e) => e.id !== entry.id);
  const candidate = { id: entry.id, localDate: entry.localDate, takenAt: entry.takenAt, categories };
  const result = computeScore({ entries: [...others, candidate], rules: challenge.rules, challenge: challenge.config, asOf: todayLocal(challenge.config) });
  const projectedPoints = result.scored.filter((s) => s.entryId === entry.id).reduce((sum, s) => sum + s.points, 0);
  return { projectedPoints, capsHit: result.capsHit };
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

    const challenge = await loadChallenge();
    const image = await storage.getObject(body.photoKey).catch(() => { throw new ApiError(400, 'photo_missing', 'Photo not uploaded'); });
    const normalized = await normalizeImage(image).catch(() => { throw new ApiError(400, 'photo_invalid', 'Photo could not be decoded'); });
    const [verdict, thumb] = await Promise.all([deps.classify(normalized), makeThumbnail(normalized)]);
    const thumbKey = newKey('thumb', user.id);
    await storage.putObject(thumbKey, thumb, 'image/jpeg');

    const takenAt = new Date(body.takenAt);
    const [entry] = await db.insert(schema.entries).values({
      userId: user.id,
      challengeId: challenge.id,
      photoKey: body.photoKey,
      thumbKey,
      takenAt,
      localDate: toLocalDate(takenAt, challenge.config.timezone),
      lat: body.lat,
      lng: body.lng,
      placeName: body.placeName,
      placeSource: body.placeSource ?? (body.placeName ? 'manual' : 'none'),
    }).returning();

    await db.insert(schema.aiVerdicts).values({
      entryId: entry!.id, model: verdict.model, categoriesJson: verdict.categories, healthy: verdict.healthy,
      confidence: verdict.confidence, reason: verdict.reason, rawResponse: verdict.raw, latencyMs: verdict.latencyMs, failed: verdict.failed,
    });
    if (verdict.categories.length > 0) {
      await db.insert(schema.entryCategories).values(verdict.categories.map((category) => ({ entryId: entry!.id, category, source: 'ai' as const })));
    }

    const proj = await projection(user.id, entry!, verdict.categories);
    return c.json({ entry: await toEntryDto(entry!, verdict.categories), verdict: toVerdictDto(verdict), ...proj }, 201);
  });

  r.patch('/:id', validate('json', patchBody), async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, c.req.param('id')), eq(schema.entries.userId, user.id), ne(schema.entries.status, 'rejected')));
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');

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

    const proj = await projection(user.id, updated!, categories);
    return c.json({ entry: await toEntryDto(updated!, categories), ...proj });
  });

  r.delete('/:id', async (c) => {
    const user = c.get('user');
    const res = await db.update(schema.entries).set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(schema.entries.id, c.req.param('id')), eq(schema.entries.userId, user.id))).returning({ id: schema.entries.id });
    if (res.length === 0) throw new ApiError(404, 'not_found', 'Entry not found');
    return c.body(null, 204);
  });

  r.get('/mine', async (c) => {
    const user = c.get('user');
    const challenge = await loadChallenge();
    const rows = await db.select().from(schema.entries)
      .where(and(eq(schema.entries.userId, user.id), ne(schema.entries.status, 'rejected')))
      .orderBy(desc(schema.entries.takenAt)).limit(200);
    const score = computeScore({ entries: (await loadConfirmedEntries([user.id])).get(user.id) ?? [], rules: challenge.rules, challenge: challenge.config, asOf: todayLocal(challenge.config) });
    const entries = [];
    for (const row of rows) {
      const cats = await categoriesOf(row.id);
      const points = score.scored.filter((s) => s.entryId === row.id).reduce((sum, s) => sum + s.points, 0);
      const capped = score.scored.some((s) => s.entryId === row.id && s.capped);
      entries.push({ ...(await toEntryDto(row, cats)), points, capped });
    }
    return c.json({ entries });
  });

  return r;
}
