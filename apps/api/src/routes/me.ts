import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { schema, patchMeBody as patchMe, registerDeviceBody as registerDevice, type DeviceDto, type UserDto } from '@skinny/shared';
import { db } from '../db.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { ApiError } from '../errors.js';
import { validate } from '../validate.js';

/**
 * The DB rows carry `Date`s where the wire carries ISO strings. `c.json` would serialise
 * them identically, but mapping explicitly is what lets the handlers be checked against
 * the shared DTOs, so a column rename becomes a compile error instead of a client bug.
 */
function toUserDto(u: typeof schema.users.$inferSelect): UserDto {
  return {
    id: u.id, firebaseUid: u.firebaseUid, displayName: u.displayName, avatarKey: u.avatarKey,
    role: u.role, status: u.status, locale: u.locale, createdAt: u.createdAt.toISOString(),
  };
}

function toDeviceDto(d: typeof schema.deviceTokens.$inferSelect): DeviceDto {
  return {
    id: d.id, userId: d.userId, token: d.token, platform: d.platform, locale: d.locale,
    createdAt: d.createdAt.toISOString(), lastSeenAt: d.lastSeenAt.toISOString(),
  };
}

export const meRoutes = new Hono<AuthEnv>();
meRoutes.use(authenticate);

meRoutes.get('/', (c) => c.json({ user: toUserDto(c.get('user')) }));

meRoutes.patch('/', validate('json', patchMe), async (c) => {
  const me = c.get('user');
  const patch = c.req.valid('json');
  // Presigned avatar keys are always minted under the caller's own prefix; anything
  // else would let a member point their profile at another member's upload.
  if (patch.avatarKey !== undefined && !patch.avatarKey.startsWith(`avatars/${me.id}/`)) {
    throw new ApiError(403, 'forbidden', 'Avatar does not belong to you');
  }
  const [user] = await db.update(schema.users).set(patch).where(eq(schema.users.id, me.id)).returning();
  return c.json({ user: toUserDto(user!) });
});

// ---- push devices (spec §E)
// `meRoutes` only applies `authenticate`, because a pending user is allowed to read /me.
// Registering for reminders is a member feature, so these two paths get `requireActive`
// scoped to themselves. Hono's `/devices/*` does not match `/devices`, hence two lines.
meRoutes.use('/devices', requireActive);
meRoutes.use('/devices/*', requireActive);

meRoutes.post('/devices', validate('json', registerDevice), async (c) => {
  const me = c.get('user');
  const body = c.req.valid('json');
  // The token is unique across the whole table: the same phone re-signing in as a different
  // member must move the row, not create a second one that would double-send.
  const [device] = await db
    .insert(schema.deviceTokens)
    .values({ userId: me.id, token: body.token, platform: body.platform, locale: body.locale })
    .onConflictDoUpdate({
      target: schema.deviceTokens.token,
      set: { userId: me.id, platform: body.platform, locale: body.locale, lastSeenAt: new Date() },
    })
    .returning();
  return c.json({ device: toDeviceDto(device!) }, 201);
});

meRoutes.delete('/devices/:token', async (c) => {
  const me = c.get('user');
  const token = c.req.param('token');
  const deleted = await db
    .delete(schema.deviceTokens)
    .where(and(eq(schema.deviceTokens.token, token), eq(schema.deviceTokens.userId, me.id)))
    .returning({ id: schema.deviceTokens.id });
  // 404 rather than 403 for someone else's token: never confirm that it exists.
  if (deleted.length === 0) throw new ApiError(404, 'not_found', 'Device token not found');
  return c.body(null, 204);
});
