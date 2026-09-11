import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../db.js';
import { authenticate, type AuthEnv } from '../middleware/auth.js';
import { ApiError } from '../errors.js';
import { validate } from '../validate.js';

export const meRoutes = new Hono<AuthEnv>();
meRoutes.use(authenticate);

meRoutes.get('/', (c) => c.json({ user: c.get('user') }));

const patchMe = z.object({ displayName: z.string().min(1).max(40).optional(), avatarKey: z.string().min(1).optional() })
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });
meRoutes.patch('/', validate('json', patchMe), async (c) => {
  const me = c.get('user');
  const patch = c.req.valid('json');
  // Presigned avatar keys are always minted under the caller's own prefix; anything
  // else would let a member point their profile at another member's upload.
  if (patch.avatarKey !== undefined && !patch.avatarKey.startsWith(`avatars/${me.id}/`)) {
    throw new ApiError(403, 'forbidden', 'Avatar does not belong to you');
  }
  const [user] = await db.update(schema.users).set(patch).where(eq(schema.users.id, me.id)).returning();
  return c.json({ user });
});
