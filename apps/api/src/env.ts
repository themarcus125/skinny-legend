import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
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
});

export type Env = z.infer<typeof schema>;
export const env: Env = schema.parse(process.env);
