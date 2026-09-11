import 'dotenv/config';
import { z } from 'zod';

const FIREBASE_VARS = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'] as const;
const SERVICE_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'OPENROUTER_API_KEY'] as const;

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
    FIREBASE_PROJECT_ID: z.string().default(''),
    FIREBASE_CLIENT_EMAIL: z.string().default(''),
    FIREBASE_PRIVATE_KEY: z.string().default(''),
    R2_ACCOUNT_ID: z.string().default(''),
    R2_ACCESS_KEY_ID: z.string().default(''),
    R2_SECRET_ACCESS_KEY: z.string().default(''),
    R2_BUCKET: z.string().default('skinny-legend'),
    OPENROUTER_API_KEY: z.string().default(''),
    VISION_MODEL: z.string().default('qwen/qwen3.7-flash'),
    AUTH_MODE: z.enum(['firebase', 'test']).default('firebase'),
    // Comma-separated list of browser origins allowed to call this API (the admin dashboard).
    CORS_ORIGINS: z.string().default('http://localhost:3001'),
  })
  // Every var above has a default so the test suite can boot with an almost-empty
  // environment; the real requirements depend on AUTH_MODE and are enforced here.
  .superRefine((v, ctx) => {
    const missing: string[] = [];
    if (v.AUTH_MODE === 'firebase') missing.push(...FIREBASE_VARS.filter((k) => !v[k]));
    // AUTH_MODE=test swaps in in-memory storage and a stub classifier, so R2 and
    // OpenRouter credentials are only required for a real deployment.
    if (v.AUTH_MODE !== 'test') missing.push(...SERVICE_VARS.filter((k) => !v[k]));
    if (missing.length > 0) {
      ctx.addIssue({ code: 'custom', message: `missing or empty with AUTH_MODE=${v.AUTH_MODE}: ${missing.join(', ')}` });
    }
  });

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.length > 0 ? `${i.path.join('.')}: ` : ''}${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env: Env = parsed.data;

if (env.AUTH_MODE === 'test' && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_MODE=test is not allowed in production');
}
