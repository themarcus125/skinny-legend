import { Hono } from 'hono';
import { errorHandler } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { uploadRoutes } from './routes/uploads.js';
import { entryRoutes, type EntryDeps } from './routes/entries.js';
import { readRoutes } from './routes/read.js';
import { feedbackRoutes } from './routes/feedback.js';
import { adminRoutes } from './routes/admin.js';
import { classifyPhoto } from './services/vision.js';
import { type AuthEnv } from './middleware/auth.js';

export function createApp(deps: Partial<EntryDeps> = {}) {
  const app = new Hono<AuthEnv>();
  app.onError(errorHandler);
  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/auth', authRoutes);
  app.route('/me', meRoutes);
  app.route('/uploads', uploadRoutes);
  app.route('/entries', entryRoutes({ classify: deps.classify ?? classifyPhoto }));
  app.route('/feedback', feedbackRoutes);
  app.route('/admin', adminRoutes);
  app.route('/', readRoutes);
  return app;
}
