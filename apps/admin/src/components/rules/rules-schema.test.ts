import { describe, expect, it } from 'vitest';
import type { RulesResponse } from '@/lib/api/types';
import { rulesFormSchema, toFormValues, toRulesPayload, type RulesFormValues } from './rules-schema';

// Identity translator: the schema's messages come back as their `rules.*` key suffixes.
const schema = rulesFormSchema((key) => key);

const valid: RulesFormValues = {
  startDate: '2026-09-08',
  endDate: '2026-12-25',
  streakPoints: 5,
  streakLength: 7,
  rules: [
    { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
    { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
    { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
  ],
};

function errorsOf(values: unknown): string[] {
  const result = schema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('rulesFormSchema', () => {
  it('accepts the seeded rulebook', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('rejects a duplicate category', () => {
    const values = { ...valid, rules: [valid.rules[0]!, { ...valid.rules[0]! }] };
    expect(errorsOf(values)).toContain('errors.categoryUnique');
  });

  it('rejects an end date before the start date', () => {
    expect(errorsOf({ ...valid, endDate: '2026-09-07' })).toContain('errors.endAfterStart');
  });

  it('rejects a malformed date', () => {
    expect(errorsOf({ ...valid, startDate: '08/09/2026' })).toContain('errors.dateFormat');
  });

  it('rejects negative points and a zero streak length', () => {
    expect(errorsOf({ ...valid, rules: [{ ...valid.rules[0]!, points: -1 }] })).toContain('errors.nonNegative');
    expect(errorsOf({ ...valid, streakLength: 0 })).toContain('errors.minOneDay');
  });

  it('rejects an empty rule list', () => {
    expect(errorsOf({ ...valid, rules: [] })).toContain('errors.categoryRequired');
  });

  it('reports a cleared number input through the catalogue, not in Zod English', () => {
    // Clearing a number input makes event.target.valueAsNumber return NaN, which trips the
    // base z.number() type check before any .int()/.min() rule — so that check needs copy too.
    const errors = errorsOf({ ...valid, streakPoints: Number.NaN });
    expect(errors).toContain('errors.number');
    expect(errors.join(' ')).not.toMatch(/[Ee]xpected|[Rr]eceived|NaN/);
  });
});

describe('toFormValues / toRulesPayload', () => {
  const response: RulesResponse = {
    challenge: {
      id: 'c-1',
      name: 'Operation Skinny Legend',
      startDate: '2026-09-08',
      endDate: '2026-12-25',
      timezone: 'Asia/Ho_Chi_Minh',
      streakPoints: 5,
      streakLength: 7,
    },
    rules: [
      { id: 'r-1', challengeId: 'c-1', category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
      { id: 'r-2', challengeId: 'c-1', category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
      { id: 'r-3', challengeId: 'c-1', category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
    ],
  };

  it('drops the server-only fields when filling the form', () => {
    expect(toFormValues(response)).toEqual(valid);
  });

  it('rebuilds exactly the PUT body the API validates', () => {
    expect(toRulesPayload(valid)).toEqual({
      challenge: { startDate: '2026-09-08', endDate: '2026-12-25', streakPoints: 5, streakLength: 7 },
      rules: [
        { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
        { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
        { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
      ],
    });
  });
});
