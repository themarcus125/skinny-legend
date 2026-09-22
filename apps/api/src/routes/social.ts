import { Hono } from 'hono';
import { and, count, eq } from 'drizzle-orm';
import { schema, type HeartResponse } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';
import { validate, uuidParam } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { notifyEntryOwner, type SocialPushDeps } from '../services/social-push.js';

type EntryRow = typeof schema.entries.$inferSelect;

/** The feed only shows confirmed entries, so reacting to anything else is a 404 even by id. */
async function confirmedEntry(id: string): Promise<EntryRow> {
  const [entry] = await db.select().from(schema.entries).where(and(eq(schema.entries.id, id), eq(schema.entries.status, 'confirmed')));
  if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
  return entry;
}

async function heartCount(entryId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.entryHearts).where(eq(schema.entryHearts.entryId, entryId));
  return row?.n ?? 0;
}

/**
 * Hearts and comments on feed entries (feed social spec §B). Mounted at `/` so it can own both
 * `/entries/:id/…` and `/comments/:id` without `entries.ts` learning about either.
 */
export function socialRoutes(deps: SocialPushDeps = {}) {
  const r = new Hono<AuthEnv>();
  r.use('/entries/:id/*', authenticate, requireActive);
  r.use('/comments/:id', authenticate, requireActive);

  r.put('/entries/:id/heart', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    const inserted = await db.insert(schema.entryHearts).values({ entryId: entry.id, userId: user.id }).onConflictDoNothing().returning({ entryId: schema.entryHearts.entryId });
    // Only a heart that was actually new is worth a push; re-tapping must not re-notify.
    if (inserted.length > 0) await notifyEntryOwner({ entry, actor: { id: user.id, displayName: user.displayName }, kind: 'heart' }, deps);
    return c.json({ heartCount: await heartCount(entry.id), heartedByMe: true } satisfies HeartResponse);
  });

  r.delete('/entries/:id/heart', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    await db.delete(schema.entryHearts).where(and(eq(schema.entryHearts.entryId, entry.id), eq(schema.entryHearts.userId, user.id)));
    return c.json({ heartCount: await heartCount(entry.id), heartedByMe: false } satisfies HeartResponse);
  });

  return r;
}
