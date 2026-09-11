import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { ApiError } from './errors.js';

type Target = 'json' | 'query' | 'param';

/** zValidator that reports failures through the standard error envelope. */
export function validate<T extends ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
      throw new ApiError(400, 'invalid_body', `${path}${first?.message ?? 'Invalid request'}`);
    }
  });
}
