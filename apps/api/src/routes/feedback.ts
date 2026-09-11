import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '@skinny/shared';
import { db } from '../db.js';
import { validate } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';

const body = z.object({ message: z.string().min(1).max(2000), screenshotKey: z.string().optional(), appVersion: z.string().max(40).optional() });

export const feedbackRoutes = new Hono<AuthEnv>();
feedbackRoutes.post('/', authenticate, requireActive, validate('json', body), async (c) => {
  const [row] = await db.insert(schema.feedback).values({ userId: c.get('user').id, ...c.req.valid('json') }).returning();
  return c.json({ feedback: row }, 201);
});
