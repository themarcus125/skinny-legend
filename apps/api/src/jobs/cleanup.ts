import { isNotNull } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db } from '../db.js';
import { storage } from '../services/storage.js';

const PREFIXES = ['photos/', 'thumbs/', 'avatars/', 'feedback/'];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanupOrphans(now = new Date()): Promise<{ deleted: string[] }> {
  const referenced = new Set<string>();
  for (const e of await db.select({ p: schema.entries.photoKey, t: schema.entries.thumbKey }).from(schema.entries)) { referenced.add(e.p); if (e.t) referenced.add(e.t); }
  for (const u of await db.select({ a: schema.users.avatarKey }).from(schema.users).where(isNotNull(schema.users.avatarKey))) referenced.add(u.a!);
  for (const f of await db.select({ s: schema.feedback.screenshotKey }).from(schema.feedback).where(isNotNull(schema.feedback.screenshotKey))) referenced.add(f.s!);

  const deleted: string[] = [];
  for (const prefix of PREFIXES) {
    for (const obj of await storage.listKeys(prefix)) {
      if (referenced.has(obj.key)) continue;
      if (now.getTime() - obj.lastModified.getTime() < MAX_AGE_MS) continue;
      await storage.deleteObject(obj.key);
      deleted.push(obj.key);
    }
  }
  return { deleted };
}

if (process.argv[1]?.endsWith('cleanup.ts') || process.argv[1]?.endsWith('cleanup.js')) {
  const { deleted } = await cleanupOrphans();
  console.log(`deleted ${deleted.length} orphaned objects`);
  process.exit(0);
}
