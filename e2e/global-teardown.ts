import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { cleanupR2 } from '@skinny/e2e-support';
import { LOG_DIR, R2_KEY_LOG, ROOT, STORAGE_PREFIX, r2Config } from './src/config.js';
import { stopServices } from './src/processes.js';
import { redactLogDir } from './src/redact.js';

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

  // The service logs are uploaded as a CI artifact, and the API's SDK errors can carry a
  // presigned URL — a live PUT plus the access key id inside `X-Amz-Credential`. Redact before
  // anything can collect them, and only once the services have stopped writing.
  try {
    const redacted = await redactLogDir(LOG_DIR);
    console.log(
      redacted.length > 0
        ? `[e2e] redacted secrets in ${redacted.join(', ')}`
        : '[e2e] redaction pass found no secrets in e2e/logs',
    );
  } catch (error) {
    console.error('[e2e] log redaction failed:', error);
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
