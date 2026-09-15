import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isPortFree } from '@skinny/e2e-support';
import { PORTS, REQUIRED_SECRETS } from './config.js';

const run = promisify(execFile);

/**
 * Every failure is one line naming the fix (spec §5). Returns an empty array when the machine
 * is ready. `E2E_REUSE=1` means "the stack is already up", so the port checks are skipped.
 */
export async function preflight(): Promise<string[]> {
  const failures: string[] = [];

  try {
    await run('docker', ['info']);
  } catch {
    failures.push('Docker is not reachable — start Docker Desktop, then re-run `pnpm e2e`.');
  }

  for (const key of REQUIRED_SECRETS) {
    if (!process.env[key]) {
      failures.push(
        `${key} is missing — add it to the repo-root .env (see docs/testing/e2e.md) or export it.`,
      );
    }
  }

  if (process.env.E2E_REUSE !== '1') {
    for (const [name, port] of Object.entries(PORTS)) {
      // The emulator is expected to be listening; the three app ports must be free.
      if (name === 'emulator') continue;
      if (!(await isPortFree(port))) {
        failures.push(
          `Port ${port} (${name}) is in use — stop what is on it, or re-run with E2E_REUSE=1 to use it as is.`,
        );
      }
    }
  }

  return failures;
}
