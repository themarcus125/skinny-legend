import { count } from 'drizzle-orm';
import { schema } from '@skinny/shared';
import { db, sql } from './db.js';

// The challenge table has no natural unique key, so guard on emptiness instead of an
// upsert: re-running the seed against a populated database must not add a second row.
const [existing] = await db.select({ n: count() }).from(schema.challenges);

if ((existing?.n ?? 0) > 0) {
  console.log('challenge already exists, skipping seed');
} else {
  const [challenge] = await db.insert(schema.challenges).values({
    name: 'Operation Skinny Legend',
    startDate: '2026-09-08',
    endDate: '2026-12-25',
  }).returning();

  await db.insert(schema.scoringRules).values([
    { challengeId: challenge!.id, category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
    { challengeId: challenge!.id, category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
    { challengeId: challenge!.id, category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
  ]);
  console.log('seeded challenge', challenge!.id);
}
await sql.end();
