import { createMiddleware } from 'hono/factory';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { eq } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../db.js';
import { env } from '../env.js';
import { ApiError } from '../errors.js';

export type AuthUser = typeof schema.users.$inferSelect;
export type AuthEnv = { Variables: { user: AuthUser } };

function firebase() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
  }
  return getAuth();
}

async function identify(headers: Headers): Promise<{ uid: string; name: string; avatarUrl?: string }> {
  if (env.AUTH_MODE === 'test') {
    const uid = headers.get('x-test-uid');
    if (!uid) throw new ApiError(401, 'unauthenticated', 'Missing or invalid token');
    return { uid, name: headers.get('x-test-name') ?? uid };
  }
  const auth = headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new ApiError(401, 'unauthenticated', 'Missing or invalid token');
  try {
    const decoded = await firebase().verifyIdToken(auth.slice(7));
    return { uid: decoded.uid, name: decoded.name ?? decoded.email?.split('@')[0] ?? 'Member' };
  } catch {
    throw new ApiError(401, 'unauthenticated', 'Missing or invalid token');
  }
}

/** Verifies identity and upserts the user row. */
export const authenticate = createMiddleware<AuthEnv>(async (c, next) => {
  const id = await identify(c.req.raw.headers);
  let [user] = await db.select().from(schema.users).where(eq(schema.users.firebaseUid, id.uid));
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ firebaseUid: id.uid, displayName: id.name })
      .onConflictDoNothing()
      .returning();
    if (!user) {
      [user] = await db.select().from(schema.users).where(eq(schema.users.firebaseUid, id.uid));
    }
  }
  if (user!.status === 'disabled') throw new ApiError(403, 'disabled', 'Account disabled');
  c.set('user', user!);
  await next();
});

export const requireActive = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get('user').status !== 'active') throw new ApiError(403, 'pending_approval', 'Account awaiting admin approval');
  await next();
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') throw new ApiError(403, 'forbidden', 'Admin only');
  await next();
});
