import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { schema, toLocalDate, CATEGORIES, ENTRY_TITLE_MAX, ENTRY_NOTE_MAX, TEST_NOTIFICATION, type Category } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';
import { validate, uuidParam } from '../validate.js';
import { authenticate, requireAdmin, type AuthEnv } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { storage, newKey, ownedKeyPrefix } from '../services/storage.js';
import { localeFor, pushSender, type PushResult } from '../services/push.js';
import { entryPoints, loadChallenge, loadUserScore } from '../services/score.js';
import { makeThumbnail, normalizeImage } from '../services/thumbnail.js';
import { toEntryDto, TAKEN_AT_FUTURE_TOLERANCE_MS } from './entries.js';

export const adminRoutes = new Hono<AuthEnv>();
adminRoutes.use(authenticate, requireAdmin);

// ---- users
adminRoutes.get('/users', async (c) => {
  const users = await db.select().from(schema.users).orderBy(schema.users.createdAt);
  return c.json({ users });
});

const patchUser = z.object({ status: z.enum(['pending', 'active', 'disabled']).optional(), role: z.enum(['member', 'admin']).optional(), displayName: z.string().min(1).max(40).optional() })
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });
adminRoutes.patch('/users/:id', validate('param', uuidParam), validate('json', patchUser), async (c) => {
  const id = c.req.valid('param').id;
  const patch = c.req.valid('json');
  const user = await db.transaction(async (tx) => {
    const [row] = await tx.update(schema.users).set(patch).where(eq(schema.users.id, id)).returning();
    if (!row) throw new ApiError(404, 'not_found', 'User not found');
    await writeAudit(c.get('user').id, 'user.update', 'user', id, patch, tx);
    return row;
  });
  return c.json({ user });
});

// ---- entries
const entryFilters = z.object({
  user: z.string().uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'rejected']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
adminRoutes.get('/entries', validate('query', entryFilters), async (c) => {
  const q = c.req.valid('query');
  const conds: SQL[] = [];
  if (q.user) conds.push(eq(schema.entries.userId, q.user));
  if (q.status) conds.push(eq(schema.entries.status, q.status));
  if (q.from) conds.push(gte(schema.entries.localDate, q.from));
  if (q.to) conds.push(lte(schema.entries.localDate, q.to));
  const rows = await db.select({ entry: schema.entries, user: schema.users })
    .from(schema.entries).innerJoin(schema.users, eq(schema.users.id, schema.entries.userId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.entries.createdAt)).limit(200);
  const entries = [];
  for (const { entry, user } of rows) {
    const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, entry.id))).map((r) => r.category as Category);
    const [verdict] = await db.select().from(schema.aiVerdicts).where(eq(schema.aiVerdicts.entryId, entry.id)).orderBy(desc(schema.aiVerdicts.createdAt)).limit(1);
    entries.push({
      ...(await toEntryDto(entry, cats)),
      user: { id: user.id, displayName: user.displayName },
      lat: entry.lat, lng: entry.lng,
      verdict: verdict ? { categories: verdict.categoriesJson, healthy: verdict.healthy, confidence: verdict.confidence, reason: verdict.reason, model: verdict.model, failed: verdict.failed } : null,
    });
  }
  return c.json({ entries });
});

const categoryList = z.array(z.enum(CATEGORIES)).max(3);
const takenAtField = z.string().datetime({ offset: true });
const titleField = z.string().max(ENTRY_TITLE_MAX).nullable();
const noteField = z.string().max(ENTRY_NOTE_MAX).nullable();
const placeField = z.string().max(120).nullable();

function parseTakenAt(value: string): Date {
  const takenAt = new Date(value);
  if (takenAt.getTime() - Date.now() > TAKEN_AT_FUTURE_TOLERANCE_MS) throw new ApiError(400, 'taken_at_future', 'takenAt is in the future');
  return takenAt;
}

/** Whitespace-only text is the same as none, exactly as on the member's own sheet. */
const textOrNull = (value: string | null) => value?.trim() || null;

/** The saved entry with what it now earns, so the console can say so without a second call. */
async function entryResult(row: typeof schema.entries.$inferSelect) {
  const cats = (await db.select().from(schema.entryCategories).where(eq(schema.entryCategories.entryId, row.id))).map((r) => r.category as Category);
  const score = await loadUserScore(row.userId, await loadChallenge());
  return { entry: await toEntryDto(row, cats), ...entryPoints(score, row.id) };
}

/**
 * An entry logged on a member's behalf — they forgot, or their photo carried the wrong date.
 * It is confirmed at once with the categories the admin picked, skips the AI verdict, and the
 * photo is optional. A photo, when there is one, is the admin's own upload.
 */
const createEntry = z.object({
  userId: z.string().uuid(),
  takenAt: takenAtField,
  categories: categoryList.min(1),
  photoKey: z.string().min(1).optional(),
  title: titleField.optional(),
  note: noteField.optional(),
  placeName: placeField.optional(),
});
adminRoutes.post('/entries', validate('json', createEntry), async (c) => {
  const admin = c.get('user');
  const body = c.req.valid('json');
  const takenAt = parseTakenAt(body.takenAt);
  const [member] = await db.select().from(schema.users).where(eq(schema.users.id, body.userId));
  if (!member) throw new ApiError(404, 'not_found', 'User not found');

  let thumbKey: string | null = null;
  if (body.photoKey) {
    if (!body.photoKey.startsWith(ownedKeyPrefix('photos', admin.id))) throw new ApiError(403, 'forbidden', 'Photo does not belong to you');
    const image = await storage.getObject(body.photoKey).catch(() => { throw new ApiError(400, 'photo_missing', 'Photo not uploaded'); });
    const normalized = await normalizeImage(image).catch(() => { throw new ApiError(400, 'photo_invalid', 'Photo could not be decoded'); });
    thumbKey = newKey('thumb', member.id);
    await storage.putObject(thumbKey, await makeThumbnail(normalized), 'image/jpeg');
  }

  const challenge = await loadChallenge();
  const placeName = textOrNull(body.placeName ?? null);
  const categories = [...new Set(body.categories)];
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.entries).values({
      userId: member.id,
      challengeId: challenge.id,
      photoKey: body.photoKey ?? null,
      thumbKey,
      takenAt,
      localDate: toLocalDate(takenAt, challenge.config.timezone),
      status: 'confirmed',
      placeName,
      placeSource: placeName ? 'manual' : 'none',
      title: textOrNull(body.title ?? null),
      note: textOrNull(body.note ?? null),
    }).returning();
    await tx.insert(schema.entryCategories).values(categories.map((category) => ({ entryId: row!.id, category, source: 'admin' as const })));
    await writeAudit(admin.id, 'entry.create', 'entry', row!.id, body, tx);
    return row!;
  });
  return c.json(await entryResult(created), 201);
});

const patchEntry = z.object({
  categories: categoryList.optional(),
  status: z.enum(['pending', 'confirmed', 'rejected']).optional(),
  takenAt: takenAtField.optional(),
  /** Omitted leaves the stored value alone; null or '' clears it. */
  title: titleField.optional(),
  note: noteField.optional(),
  placeName: placeField.optional(),
});
adminRoutes.patch('/entries/:id', validate('param', uuidParam), validate('json', patchEntry), async (c) => {
  const id = c.req.valid('param').id;
  const body = c.req.valid('json');
  const takenAt = body.takenAt ? parseTakenAt(body.takenAt) : undefined;
  const challenge = await loadChallenge();
  const placeName = body.placeName === undefined ? undefined : textOrNull(body.placeName);
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.entries).where(eq(schema.entries.id, id));
    if (!existing) throw new ApiError(404, 'not_found', 'Entry not found');
    if (body.categories) {
      await tx.delete(schema.entryCategories).where(eq(schema.entryCategories.entryId, id));
      const cats = [...new Set(body.categories)];
      if (cats.length) await tx.insert(schema.entryCategories).values(cats.map((category) => ({ entryId: id, category, source: 'admin' as const })));
    }
    const [row] = await tx.update(schema.entries).set({
      updatedAt: new Date(),
      ...(body.status ? { status: body.status } : {}),
      // The challenge day follows the time, so the entry's points move to the day it names.
      ...(takenAt ? { takenAt, localDate: toLocalDate(takenAt, challenge.config.timezone) } : {}),
      ...(body.title !== undefined ? { title: textOrNull(body.title) } : {}),
      ...(body.note !== undefined ? { note: textOrNull(body.note) } : {}),
      ...(placeName !== undefined ? { placeName, placeSource: placeName ? 'manual' as const : 'none' as const } : {}),
    }).where(eq(schema.entries.id, id)).returning();
    await writeAudit(c.get('user').id, 'entry.update', 'entry', id, body, tx);
    return row!;
  });
  return c.json(await entryResult(updated));
});

adminRoutes.delete('/entries/:id', validate('param', uuidParam), async (c) => {
  const id = c.req.valid('param').id;
  await db.transaction(async (tx) => {
    const res = await tx.update(schema.entries).set({ status: 'rejected', updatedAt: new Date() }).where(eq(schema.entries.id, id)).returning({ id: schema.entries.id });
    if (res.length === 0) throw new ApiError(404, 'not_found', 'Entry not found');
    await writeAudit(c.get('user').id, 'entry.reject', 'entry', id, undefined, tx);
  });
  return c.body(null, 204);
});

// ---- rules
adminRoutes.get('/rules', async (c) => {
  const [challenge] = await db.select().from(schema.challenges).orderBy(schema.challenges.startDate).limit(1);
  const rules = await db.select().from(schema.scoringRules).where(eq(schema.scoringRules.challengeId, challenge!.id));
  return c.json({ challenge, rules });
});

const putRules = z.object({
  challenge: z.object({ startDate: z.string().date(), endDate: z.string().date(), streakPoints: z.number().int().min(0), streakLength: z.number().int().min(1) }),
  rules: z.array(z.object({ category: z.enum(['exercise', 'meal', 'group']), points: z.number().int().min(0), capCount: z.number().int().min(0), capPeriod: z.enum(['day', 'week']) }))
    .min(1)
    .refine((rules) => new Set(rules.map((r) => r.category)).size === rules.length, { message: 'Duplicate category in rules' }),
});
adminRoutes.put('/rules', validate('json', putRules), async (c) => {
  const body = c.req.valid('json');
  const [challenge] = await db.select().from(schema.challenges).orderBy(schema.challenges.startDate).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(schema.challenges).set(body.challenge).where(eq(schema.challenges.id, challenge!.id));
    await tx.delete(schema.scoringRules).where(eq(schema.scoringRules.challengeId, challenge!.id));
    await tx.insert(schema.scoringRules).values(body.rules.map((r) => ({ ...r, challengeId: challenge!.id })));
    await writeAudit(c.get('user').id, 'rules.update', 'challenge', challenge!.id, body, tx);
  });
  return c.json({ ok: true });
});

// ---- feedback
adminRoutes.get('/feedback', async (c) => {
  const rows = await db.select({ f: schema.feedback, user: schema.users }).from(schema.feedback)
    .innerJoin(schema.users, eq(schema.users.id, schema.feedback.userId)).orderBy(desc(schema.feedback.createdAt)).limit(200);
  const feedback = [];
  for (const { f, user } of rows) {
    feedback.push({ ...f, screenshotUrl: f.screenshotKey ? await storage.publicUrl(f.screenshotKey) : null, user: { id: user.id, displayName: user.displayName } });
  }
  return c.json({ feedback });
});

// ---- notifications (spec §E)
const notificationsQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });
adminRoutes.get('/notifications', validate('query', notificationsQuery), async (c) => {
  const { limit } = c.req.valid('query');
  const rows = await db.select({ n: schema.notificationLog, user: schema.users }).from(schema.notificationLog)
    .innerJoin(schema.users, eq(schema.users.id, schema.notificationLog.userId)).orderBy(desc(schema.notificationLog.sentAt)).limit(limit);

  // `platform` is a property of the member, not of the log row: notification_log records what was
  // sent, not which of a member's devices received it. The column therefore shows the platform of
  // that member's MOST RECENTLY SEEN device (device_tokens.last_seen_at desc), which is the surface
  // they are actually using, and falls back to 'ios' when every token has since been unregistered.
  const userIds = [...new Set(rows.map(({ user }) => user.id))];
  const devices = userIds.length === 0 ? [] : await db
    .select({ userId: schema.deviceTokens.userId, platform: schema.deviceTokens.platform })
    .from(schema.deviceTokens)
    .where(inArray(schema.deviceTokens.userId, userIds))
    .orderBy(desc(schema.deviceTokens.lastSeenAt));
  const platformByUser = new Map<string, (typeof devices)[number]['platform']>();
  for (const device of devices) if (!platformByUser.has(device.userId)) platformByUser.set(device.userId, device.platform);

  return c.json({
    notifications: rows.map(({ n, user }) => ({
      id: n.id, kind: n.kind, payload: n.payloadJson, sentAt: n.sentAt.toISOString(),
      platform: platformByUser.get(user.id) ?? 'ios',
      user: { id: user.id, displayName: user.displayName },
    })),
  });
});

const testNotification = z.object({ userId: z.string().uuid() });
adminRoutes.post('/notifications/test', validate('json', testNotification), async (c) => {
  const { userId } = c.req.valid('json');
  const [target] = await db.select({ id: schema.users.id, locale: schema.users.locale }).from(schema.users).where(eq(schema.users.id, userId));
  if (!target) throw new ApiError(404, 'not_found', 'User not found');

  const devices = await db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.userId, userId));
  if (devices.length === 0) throw new ApiError(400, 'no_device_tokens', 'User has no registered devices');

  // Same rule as the notify job: users.locale (NOT NULL, default 'vi') wins, so the column always
  // decides in practice; localeFor (most recently seen device) only guards a row read without it.
  const copy = TEST_NOTIFICATION[target.locale ?? localeFor(devices)];
  let results: PushResult[];
  try {
    // `platform` decides the wire shape: web tokens go out data-only (see services/push.ts).
    results = await pushSender.send(
      devices.map((d) => ({ token: d.token, title: copy.title, body: copy.body, data: { deepLink: 'track', kind: 'test' }, platform: d.platform })),
    );
  } catch (err) {
    // fcmSender() throws on a whole-batch failure (network, auth); fakeSender never does. Nothing
    // was delivered and no per-token verdicts exist, so no tokens are dropped and nothing is audited.
    const reason = err instanceof Error ? err.message : String(err);
    throw new ApiError(502, 'push_failed', `Push delivery failed: ${reason}`);
  }

  const dead = results.filter((r) => r.unregistered).map((r) => r.token);
  if (dead.length > 0) await db.delete(schema.deviceTokens).where(inArray(schema.deviceTokens.token, dead));

  const sent = results.filter((r) => r.ok).length;
  // A test send is not a planned reminder: it never touches notification_log (whose `kind` enum has no
  // `test` value) and must not suppress tomorrow's real one through the 24h dedupe rule. It is an
  // admin write, so it does get an audit row.
  await writeAudit(c.get('user').id, 'notification.test', 'user', userId, { tokens: devices.length, sent, removedTokens: dead.length });
  return c.json({ sent, tokens: devices.length, removedTokens: dead.length });
});
