import { Hono } from 'hono';
import { and, asc, count, eq } from 'drizzle-orm';
import { commentBody, commentExcerpt, schema, type CommentDto, type CommentsResponse, type HeartResponse, type PostCommentResponse } from '@skinny/shared';
import { db } from '../db.js';
import { ApiError } from '../errors.js';
import { validate, uuidParam } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { notifyEntryOwner, type SocialPushDeps } from '../services/social-push.js';
import { storage } from '../services/storage.js';

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

const COMMENTS_MAX = 200;

async function commentCount(entryId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(schema.entryComments).where(eq(schema.entryComments.entryId, entryId));
  return row?.n ?? 0;
}

type CommentRow = typeof schema.entryComments.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

async function toCommentDto(row: CommentRow, author: UserRow, viewerId: string, entryOwnerId: string): Promise<CommentDto> {
  return {
    id: row.id,
    entryId: row.entryId,
    user: { id: author.id, displayName: author.displayName, avatarUrl: author.avatarKey ? await storage.publicUrl(author.avatarKey) : null },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    canDelete: viewerId === row.userId || viewerId === entryOwnerId,
  };
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

  r.get('/entries/:id/comments', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    const rows = await db.select({ comment: schema.entryComments, author: schema.users })
      .from(schema.entryComments).innerJoin(schema.users, eq(schema.users.id, schema.entryComments.userId))
      .where(eq(schema.entryComments.entryId, entry.id)).orderBy(asc(schema.entryComments.createdAt)).limit(COMMENTS_MAX);
    const comments: CommentDto[] = [];
    for (const { comment, author } of rows) comments.push(await toCommentDto(comment, author, user.id, entry.userId));
    return c.json({ comments } satisfies CommentsResponse);
  });

  r.post('/entries/:id/comments', validate('param', uuidParam), validate('json', commentBody), async (c) => {
    const user = c.get('user');
    const entry = await confirmedEntry(c.req.valid('param').id);
    const { body } = c.req.valid('json');
    // The injected clock keeps "oldest first" deterministic under a fast test run; production
    // passes no `now` and gets `new Date()`.
    const [row] = await db.insert(schema.entryComments).values({ entryId: entry.id, userId: user.id, body, createdAt: deps.now?.() ?? new Date() }).returning();
    await notifyEntryOwner({ entry, actor: { id: user.id, displayName: user.displayName }, kind: 'comment', excerpt: commentExcerpt(body) }, deps);
    const [author] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    return c.json({ comment: await toCommentDto(row!, author!, user.id, entry.userId), commentCount: await commentCount(entry.id) } satisfies PostCommentResponse, 201);
  });

  r.delete('/comments/:id', validate('param', uuidParam), async (c) => {
    const user = c.get('user');
    const [found] = await db.select({ comment: schema.entryComments, entry: schema.entries })
      .from(schema.entryComments).innerJoin(schema.entries, eq(schema.entries.id, schema.entryComments.entryId))
      .where(eq(schema.entryComments.id, c.req.valid('param').id));
    if (!found) throw new ApiError(404, 'not_found', 'Comment not found');
    if (found.comment.userId !== user.id && found.entry.userId !== user.id) throw new ApiError(403, 'forbidden', 'Not your comment');
    await db.delete(schema.entryComments).where(eq(schema.entryComments.id, found.comment.id));
    return c.body(null, 204);
  });

  return r;
}
