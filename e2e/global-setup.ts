import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ensureDatabase, migrateDatabase, seedDatabase, waitForPort } from '@skinny/e2e-support';
import {
  ADMIN_DATABASE_URL,
  ADMIN_URL,
  API_URL,
  DATABASE_NAME,
  DATABASE_URL,
  EMULATOR_HOST,
  FIREBASE_WEB_CONFIG,
  PORTS,
  PROCESS_FILE,
  PROJECT_ID,
  R2_KEY_LOG,
  ROOT,
  STORAGE_PREFIX,
  WEB_URL,
} from './src/config.js';
import { preflight } from './src/preflight.js';
import { runOnce, startService } from './src/processes.js';

const run = promisify(execFile);

export default async function globalSetup(): Promise<void> {
  loadEnv({ path: join(ROOT, '.env'), quiet: true });

  const failures = await preflight();
  if (failures.length > 0) {
    throw new Error(`Preflight failed:\n${failures.map((line) => `  - ${line}`).join('\n')}`);
  }

  const reuse = process.env.E2E_REUSE === '1';
  if (!reuse && existsSync(PROCESS_FILE)) rmSync(PROCESS_FILE);
  writeFileSync(R2_KEY_LOG, '', 'utf8');
  process.env.E2E_R2_KEY_LOG = R2_KEY_LOG;

  await run('docker', ['compose', 'up', '-d', 'db', 'auth-emulator'], { cwd: ROOT });
  await waitForPort(5432, { timeoutMs: 120_000 });
  await waitForPort(PORTS.emulator, { timeoutMs: 180_000 });

  await ensureDatabase(ADMIN_DATABASE_URL, DATABASE_NAME);
  await migrateDatabase(DATABASE_URL);
  await seedDatabase(DATABASE_URL);

  const apiEnv = {
    NODE_ENV: 'development',
    AUTH_MODE: 'firebase',
    PORT: String(PORTS.api),
    DATABASE_URL,
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_AUTH_EMULATOR_HOST: EMULATOR_HOST,
    STORAGE_KEY_PREFIX: STORAGE_PREFIX,
    CORS_ORIGINS: `${ADMIN_URL},${WEB_URL}`,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
    R2_BUCKET: process.env.R2_BUCKET!,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY!,
  };

  const adminEnv = {
    // apps/admin/.env.local carries NEXT_PUBLIC_MOCK=1 for local previews, and Next loads it at
    // build time for any variable the environment has not already set. Pinning it to 0 is what
    // keeps the e2e build talking to the real API and the real Firebase emulator.
    NEXT_PUBLIC_MOCK: '0',
    NEXT_PUBLIC_API_BASE_URL: API_URL,
    NEXT_PUBLIC_FIREBASE_API_KEY: FIREBASE_WEB_CONFIG.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: FIREBASE_WEB_CONFIG.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: FIREBASE_WEB_CONFIG.projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: FIREBASE_WEB_CONFIG.appId,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: EMULATOR_HOST,
  };

  const webEnv = {
    VITE_MOCK: '0',
    VITE_API_BASE_URL: API_URL,
    VITE_FIREBASE_API_KEY: FIREBASE_WEB_CONFIG.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: FIREBASE_WEB_CONFIG.authDomain,
    VITE_FIREBASE_PROJECT_ID: FIREBASE_WEB_CONFIG.projectId,
    VITE_FIREBASE_APP_ID: FIREBASE_WEB_CONFIG.appId,
    VITE_FIREBASE_MESSAGING_SENDER_ID: FIREBASE_WEB_CONFIG.messagingSenderId,
    VITE_FIREBASE_AUTH_EMULATOR_HOST: EMULATOR_HOST,
  };

  if (!reuse) {
    await runOnce('api', 'pnpm', ['--filter', '@skinny/shared', 'build'], ROOT, {});
    await runOnce('api', 'pnpm', ['--filter', '@skinny/api', 'build'], ROOT, apiEnv);
    await runOnce('admin', 'pnpm', ['--filter', '@skinny/admin', 'build'], ROOT, adminEnv);
    await runOnce('web', 'pnpm', ['--filter', '@skinny/web', 'build'], ROOT, webEnv);
  }

  await startService({
    name: 'api',
    command: 'pnpm',
    args: ['exec', 'node', 'dist/index.js'],
    cwd: join(ROOT, 'apps/api'),
    env: apiEnv,
    port: PORTS.api,
  });
  await startService({
    name: 'admin',
    command: 'pnpm',
    args: ['exec', 'next', 'start', '-p', String(PORTS.admin)],
    cwd: join(ROOT, 'apps/admin'),
    env: adminEnv,
    port: PORTS.admin,
  });
  await startService({
    name: 'web',
    command: 'pnpm',
    args: ['exec', 'vite', 'preview', '--port', String(PORTS.web), '--strictPort'],
    cwd: join(ROOT, 'apps/web'),
    env: webEnv,
    port: PORTS.web,
  });
}
