import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env.js';
import { errorHandler } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { uploadRoutes } from './routes/uploads.js';
import { entryRoutes, type EntryDeps } from './routes/entries.js';
import { readRoutes } from './routes/read.js';
import { feedbackRoutes } from './routes/feedback.js';
import { adminRoutes } from './routes/admin.js';
import { placeRoutes, type PlaceDeps } from './routes/places.js';
import { socialRoutes } from './routes/social.js';
import { classifyPhoto } from './services/vision.js';
import { type SocialPushDeps } from './services/social-push.js';
import { type AuthEnv } from './middleware/auth.js';

export function createApp(deps: Partial<EntryDeps & PlaceDeps & SocialPushDeps> = {}) {
  const app = new Hono<AuthEnv>();
  app.onError(errorHandler);

  // The admin dashboard is a separate origin (localhost:3001 in dev, Vercel in production),
  // so every /admin/* and /auth/* call is cross-origin. Origins come from CORS_ORIGINS.
  const allowedOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    '/*',
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));
  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/auth', authRoutes);
  app.route('/me', meRoutes);
  app.route('/uploads', uploadRoutes);
  app.route('/entries', entryRoutes({ classify: deps.classify ?? classifyPhoto }));
  app.route('/feedback', feedbackRoutes);
  app.route('/admin', adminRoutes);
  app.route('/places', placeRoutes({ nearby: deps.nearby }));
  app.route('/', socialRoutes({ sender: deps.sender, now: deps.now }));
  app.route('/', readRoutes);
  return app;
}
