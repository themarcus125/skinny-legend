import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { cleanupR2 } from '@skinny/e2e-support';
import { R2_KEY_LOG, ROOT, STORAGE_PREFIX, r2Config } from './src/config.js';
import { stopServices } from './src/processes.js';

export default async function globalTeardown(): Promise<void> {
  // Ruling R3: teardown runs in its own process, so the root .env has to be loaded again before
  // the sweep — `r2Config()` reads it straight out of `process.env`.
  loadEnv({ path: join(ROOT, '.env'), quiet: true });

  // Ruling R4's other half: `E2E_REUSE=1` keeps the stack up for the next run.
  if (process.env.E2E_REUSE === '1') {
    console.log('[e2e] E2E_REUSE=1: leaving the api/admin/web processes running');
  } else {
    await stopServices();
  }

  try {
    const deleted = await cleanupR2({
      config: r2Config(),
      prefix: STORAGE_PREFIX,
      logPath: R2_KEY_LOG,
    });
    console.log(`[e2e] removed ${deleted.length} R2 object(s) under ${STORAGE_PREFIX}`);
  } catch (error) {
    // A failed sweep must not turn a green run red; the next run's sweep picks the leftovers up.
    console.error('[e2e] R2 cleanup failed:', error);
  }
  // The containers stay up on purpose (spec §2). `pnpm e2e:down` removes them.
}
