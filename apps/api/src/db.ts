import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@skinny/shared';
import { env } from './env.js';

// No prepared statements, for Neon's transaction-mode PgBouncer (pooled URL).
export const sql = postgres(env.DATABASE_URL, { max: 10, prepare: false });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
