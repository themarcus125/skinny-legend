import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: '../../packages/shared/src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://skinny:skinny@localhost:5432/skinny' },
});
