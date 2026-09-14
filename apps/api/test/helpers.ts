import { schema } from '@skinny/shared';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { createApp } from '../src/app.js';

export const app = createApp();

export async function resetDb() {
  await db.delete(schema.placeCache);
  await db.delete(schema.auditLog);
  await db.delete(schema.notificationLog);
  await db.delete(schema.deviceTokens);
  await db.delete(schema.feedback);
  await db.delete(schema.aiVerdicts);
  await db.delete(schema.entryCategories);
  await db.delete(schema.entries);
  await db.delete(schema.users);
}

export async function asUser(uid: string, opts: { name?: string; activate?: boolean; admin?: boolean } = {}) {
  const headers = { 'x-test-uid': uid, 'x-test-name': opts.name ?? uid };
  await app.request('/auth/session', { method: 'POST', headers });
  if (opts.activate || opts.admin) {
    await db.update(schema.users)
      .set({ status: 'active', role: opts.admin ? 'admin' : 'member' })
      .where(eq(schema.users.firebaseUid, uid));
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.firebaseUid, uid));
  return { headers, user: user! };
}

export async function challengeId() {
  const [c] = await db.select().from(schema.challenges);
  return c!.id;
}
