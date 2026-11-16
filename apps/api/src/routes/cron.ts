import { Hono } from 'hono';
import { timingSafeEqual } from 'hono/utils/buffer';
import { env } from '../env.js';
import { ApiError } from '../errors.js';
import { cleanupOrphans } from '../jobs/cleanup.js';

export const cronRoutes = new Hono();
cronRoutes.get('/cleanup', async (c) => {
  // An unset secret must refuse, or `Bearer ` would match `Bearer ${''}`.
  const authorized = env.CRON_SECRET !== '' && (await timingSafeEqual(c.req.header('authorization') ?? '', `Bearer ${env.CRON_SECRET}`));
  if (!authorized) throw new ApiError(401, 'unauthenticated', 'Missing or invalid cron secret');
  return c.json({ deleted: (await cleanupOrphans()).deleted.length });
});
