import { Hono } from 'hono';
import { presignBody as body } from '@skinny/shared';
import { validate } from '../validate.js';
import { authenticate, type AuthEnv } from '../middleware/auth.js';
import { ApiError } from '../errors.js';
import { newKey, storage, PRESIGN_TTL_SECONDS } from '../services/storage.js';

export const uploadRoutes = new Hono<AuthEnv>();
uploadRoutes.post('/presign', authenticate, validate('json', body), async (c) => {
  const { kind, contentType } = c.req.valid('json');
  const user = c.get('user');
  if (kind !== 'avatar' && user.status !== 'active') throw new ApiError(403, 'pending_approval', 'Account awaiting admin approval');
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/heic' ? 'heic' : 'jpg';
  const key = newKey(kind, user.id, ext);
  const url = await storage.presignPut(key, contentType);
  return c.json({ key, url, expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString() });
});
