import { z } from 'zod';
import type { RulesPayload, RulesResponse } from '@/lib/api/types';

/**
 * Every rule carries Vietnamese copy, including the base type check: Zod's default type-error
 * text is English, and an emptied <Input type="number"> yields NaN, which trips that check
 * first. In Zod 4 the type-error message is the `error` option (Zod 3's `invalid_type_error`).
 */
const isoDate = z
  .string({ error: 'Ngày phải có dạng YYYY-MM-DD' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD');

const wholeNumber = z.number({ error: 'Phải là số' }).int('Phải là số nguyên');

export const rulesFormSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    streakPoints: wholeNumber.min(0, 'Không được âm'),
    streakLength: wholeNumber.min(1, 'Tối thiểu 1 ngày'),
    rules: z
      .array(
        z.object({
          category: z.enum(['exercise', 'meal', 'group'], { error: 'Hạng mục không hợp lệ' }),
          points: wholeNumber.min(0, 'Không được âm'),
          capCount: wholeNumber.min(0, 'Không được âm'),
          capPeriod: z.enum(['day', 'week'], { error: 'Chu kỳ không hợp lệ' }),
        }),
        { error: 'Cần ít nhất một hạng mục' },
      )
      .min(1, 'Cần ít nhất một hạng mục'),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: 'Ngày kết thúc phải sau ngày bắt đầu',
    path: ['endDate'],
  })
  // Mirrors the server refine in apps/api/src/routes/admin.ts (PUT /admin/rules).
  .refine((values) => new Set(values.rules.map((rule) => rule.category)).size === values.rules.length, {
    message: 'Mỗi hạng mục chỉ được xuất hiện một lần',
    path: ['rules'],
  });

export type RulesFormValues = z.infer<typeof rulesFormSchema>;

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
