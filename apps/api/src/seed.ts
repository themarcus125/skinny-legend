import { schema } from '@skinny/shared';
import { db, sql } from './db.js';

const [challenge] = await db.insert(schema.challenges).values({
  name: 'Operation Skinny Legend',
  startDate: '2026-09-08',
  endDate: '2026-12-25',
}).onConflictDoNothing().returning();

if (challenge) {
  await db.insert(schema.scoringRules).values([
    { challengeId: challenge.id, category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
    { challengeId: challenge.id, category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
    { challengeId: challenge.id, category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
  ]);
  console.log('seeded challenge', challenge.id);
} else {
  console.log('challenge already exists');
}
await sql.end();
