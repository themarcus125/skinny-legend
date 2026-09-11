import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@skinny/shared';
import { env } from './env.js';

export const sql = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
