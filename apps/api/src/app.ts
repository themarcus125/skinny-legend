import { Hono } from 'hono';
import { errorHandler } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { uploadRoutes } from './routes/uploads.js';
import { authenticate, requireActive, type AuthEnv } from './middleware/auth.js';

export function createApp() {
  const app = new Hono<AuthEnv>();
  app.onError(errorHandler);
  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/auth', authRoutes);
  app.route('/me', meRoutes);
  app.route('/uploads', uploadRoutes);
  // Placeholder active-only route so the gating test has a target; replaced in Task 10.
  app.get('/leaderboard', authenticate, requireActive, (c) => c.json({ leaderboard: [] }));
  return app;
}
