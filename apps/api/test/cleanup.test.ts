import { describe, it, expect, beforeEach } from 'vitest';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';
import { storage } from '../src/services/storage.js';
import { cleanupOrphans } from '../src/jobs/cleanup.js';
import { resetDb, asUser, challengeId } from './helpers.js';

beforeEach(resetDb);

describe('cleanupOrphans', () => {
  it('deletes unreferenced objects older than 24h and keeps referenced ones', async () => {
    const { user } = await asUser('u', { activate: true });
    const mem = storage as unknown as { objects: Map<string, Buffer> };
    await storage.putObject(`photos/${user.id}/orphan.jpg`, Buffer.from('x'), 'image/jpeg');
    await storage.putObject(`photos/${user.id}/kept.jpg`, Buffer.from('x'), 'image/jpeg');
    await storage.putObject(`avatars/${user.id}/kept.jpg`, Buffer.from('x'), 'image/jpeg');
    await db.update(schema.users).set({ avatarKey: `avatars/${user.id}/kept.jpg` });
    await db.insert(schema.entries).values({ userId: user.id, challengeId: await challengeId(), photoKey: `photos/${user.id}/kept.jpg`, takenAt: new Date(), localDate: '2026-09-10' });
    // memory storage reports lastModified = epoch, so everything is "older than 24h"
    const { deleted } = await cleanupOrphans(new Date());
    expect(deleted).toEqual([`photos/${user.id}/orphan.jpg`]);
    expect(mem.objects.has(`photos/${user.id}/kept.jpg`)).toBe(true);
    expect(mem.objects.has(`avatars/${user.id}/kept.jpg`)).toBe(true);
  });
});
