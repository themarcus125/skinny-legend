import { describe, it, expect } from 'vitest';
import { schema } from '@skinny/shared';
import { db } from '../src/db.js';

describe('schema', () => {
  it('has the seeded challenge with three rules', async () => {
    const rules = await db.select().from(schema.scoringRules);
    expect(rules.map((r) => r.category).sort()).toEqual(['exercise', 'group', 'meal']);
  });
});
