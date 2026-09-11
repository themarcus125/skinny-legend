import { Hono } from 'hono';
import { authenticate, type AuthEnv } from '../middleware/auth.js';

export const authRoutes = new Hono<AuthEnv>();
authRoutes.post('/session', authenticate, (c) => c.json({ user: c.get('user') }));
