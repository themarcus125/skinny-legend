import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../db.js';
import { authenticate, type AuthEnv } from '../middleware/auth.js';

export const meRoutes = new Hono<AuthEnv>();
meRoutes.use(authenticate);

meRoutes.get('/', (c) => c.json({ user: c.get('user') }));

const patchMe = z.object({ displayName: z.string().min(1).max(40).optional(), avatarKey: z.string().min(1).optional() });
meRoutes.patch('/', zValidator('json', patchMe), async (c) => {
  const [user] = await db.update(schema.users).set(c.req.valid('json')).where(eq(schema.users.id, c.get('user').id)).returning();
  return c.json({ user });
});
