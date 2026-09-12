import { z } from 'zod';
import type { RulesPayload, RulesResponse } from '@/lib/api/types';

/** Keys under `rules.*` in messages/*.json — the form passes its `useTranslations('rules')`. */
export type RulesErrorKey =
  | 'errors.categoryRequired'
  | 'errors.categoryUnique'
  | 'errors.categoryInvalid'
  | 'errors.periodInvalid'
  | 'errors.number'
  | 'errors.integer'
  | 'errors.nonNegative'
  | 'errors.minOneDay'
  | 'errors.dateFormat'
  | 'errors.endAfterStart';

/**
 * Zod validates outside React, so the schema is a factory that takes the translator instead of
 * calling `useTranslations` itself. Every rule carries copy, including the base type check: Zod's
 * default type-error text is English, and an emptied <Input type="number"> yields NaN, which trips
 * that check first. In Zod 4 the type-error message is the `error` option (Zod 3's
 * `invalid_type_error`).
 */
export function rulesFormSchema(t: (key: RulesErrorKey) => string) {
  const isoDate = z
    .string({ error: t('errors.dateFormat') })
    .regex(/^\d{4}-\d{2}-\d{2}$/, t('errors.dateFormat'));

  const wholeNumber = z.number({ error: t('errors.number') }).int(t('errors.integer'));

  return z
    .object({
      startDate: isoDate,
      endDate: isoDate,
      streakPoints: wholeNumber.min(0, t('errors.nonNegative')),
      streakLength: wholeNumber.min(1, t('errors.minOneDay')),
      rules: z
        .array(
          z.object({
            category: z.enum(['exercise', 'meal', 'group'], { error: t('errors.categoryInvalid') }),
            points: wholeNumber.min(0, t('errors.nonNegative')),
            capCount: wholeNumber.min(0, t('errors.nonNegative')),
            capPeriod: z.enum(['day', 'week'], { error: t('errors.periodInvalid') }),
          }),
          { error: t('errors.categoryRequired') },
        )
        .min(1, t('errors.categoryRequired')),
    })
    .refine((values) => values.endDate >= values.startDate, {
      message: t('errors.endAfterStart'),
      path: ['endDate'],
    })
    // Mirrors the server refine in apps/api/src/routes/admin.ts (PUT /admin/rules).
    .refine((values) => new Set(values.rules.map((rule) => rule.category)).size === values.rules.length, {
      message: t('errors.categoryUnique'),
      path: ['rules'],
    });
}

export type RulesFormValues = z.infer<ReturnType<typeof rulesFormSchema>>;

export function toFormValues(data: RulesResponse): RulesFormValues {
  return {
    startDate: data.challenge.startDate,
    endDate: data.challenge.endDate,
    streakPoints: data.challenge.streakPoints,
    streakLength: data.challenge.streakLength,
    rules: data.rules.map((rule) => ({
      category: rule.category,
      points: rule.points,
      capCount: rule.capCount,
      capPeriod: rule.capPeriod,
    })),
  };
}

export function toRulesPayload(values: RulesFormValues): RulesPayload {
  return {
    challenge: {
      startDate: values.startDate,
      endDate: values.endDate,
      streakPoints: values.streakPoints,
      streakLength: values.streakLength,
    },
    rules: values.rules.map((rule) => ({
      category: rule.category,
      points: rule.points,
      capCount: rule.capCount,
      capPeriod: rule.capPeriod,
    })),
  };
}
