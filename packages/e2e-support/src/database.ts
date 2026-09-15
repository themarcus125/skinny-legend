import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postgres from 'postgres';

const run = promisify(execFile);

/** The repo root, from packages/e2e-support/src/. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const API_DIR = join(REPO_ROOT, 'apps/api');

/**
 * The API env schema refuses `firebase` auth without a project id, and both the migrate and the
 * seed entrypoints load that schema. Neither touches auth, so `test` is the honest mode here.
 */
function childEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: databaseUrl, AUTH_MODE: 'test' };
}

/**
 * Children before parents, so plain DELETEs never trip a foreign key. `challenges` and
 * `scoring_rules` are deliberately absent: the seed owns them and every spec relies on them.
 */
export const RESET_ORDER = [
  'place_cache',
  'audit_log',
  'notification_log',
  'device_tokens',
  'feedback',
  'ai_verdicts',
  'entry_categories',
  'entries',
  'users',
] as const;

/** Returns `adminUrl` with its database name replaced. */
export function databaseUrlFor(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Creates the database if it does not exist. Returns the URL that points at it. */
export async function ensureDatabase(adminUrl: string, database: string): Promise<string> {
  const admin = postgres(adminUrl, { max: 1 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${database}`;
    // CREATE DATABASE cannot be parameterised or run inside a transaction; the name is a
    // repo constant, never user input. Quote-escaped all the same.
    if (rows.length === 0) await admin.unsafe(`create database "${database.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }
  return databaseUrlFor(adminUrl, database);
}

export async function migrateDatabase(databaseUrl: string): Promise<void> {
  await run('pnpm', ['exec', 'drizzle-kit', 'migrate'], { cwd: API_DIR, env: childEnv(databaseUrl) });
}

export async function seedDatabase(databaseUrl: string): Promise<void> {
  await run('pnpm', ['exec', 'tsx', 'src/seed.ts'], { cwd: API_DIR, env: childEnv(databaseUrl) });
}

/** Empties every per-run table, leaving the seeded challenge and scoring rules in place. */
export async function resetDatabase(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    for (const table of RESET_ORDER) await sql.unsafe(`delete from "${table}"`);
  } finally {
    await sql.end();
  }
}
