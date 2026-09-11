import { zValidator } from '@hono/zod-validator';
import { z, type ZodType } from 'zod';
import { ApiError } from './errors.js';

/** Shared `:id` path param shape for every route keyed by a uuid primary key. */
export const uuidParam = z.object({ id: z.string().uuid() });

type Target = 'json' | 'query' | 'param';

/** zValidator that reports failures through the standard error envelope. */
export function validate<Tgt extends Target, T extends ZodType>(target: Tgt, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
      throw new ApiError(400, 'invalid_body', `${path}${first?.message ?? 'Invalid request'}`);
    }
  });
}
