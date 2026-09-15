import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPortFree, waitForPort } from '@skinny/e2e-support';
import { LOG_DIR, PROCESS_FILE } from './config.js';

export interface ProcessSpec {
  name: 'api' | 'admin' | 'web';
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  port: number;
}

const children: ChildProcess[] = [];

/**
 * Spawns one long-running service, tees its stdout and stderr into e2e/logs/<name>.log (spec
 * §5), and resolves once its port answers. Rejects with a one-line failure that names the log.
 *
 * Ruling R4: under `E2E_REUSE=1` a port that already answers belongs to a previous run's stack,
 * so the service is adopted as is rather than started a second time.
 */
export async function startService(spec: ProcessSpec): Promise<void> {
  if (process.env.E2E_REUSE === '1' && !(await isPortFree(spec.port))) {
    console.log(`[e2e] reusing ${spec.name} already listening on ${spec.port}`);
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, `${spec.name}.log`);
  const log = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own group, so `stopServices` can kill the whole tree (next/vite spawn children).
    detached: true,
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  children.push(child);
  recordPid(child.pid);

  let exited: number | null = null;
  child.once('exit', (code) => {
    exited = code ?? 0;
  });

  try {
    await waitForPort(spec.port, { timeoutMs: 180_000 });
  } catch {
    throw new Error(
      `${spec.name} did not come up on port ${spec.port}${exited === null ? '' : ` (it exited with ${exited})`} — read ${logPath}.`,
    );
  }
}

/** Runs a one-shot command (a build) to completion, appending to the same log. */
export async function runOnce(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<void> {
  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, `${name}.log`);
  const log = createWriteStream(logPath, { flags: 'a' });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${name} build failed with exit code ${code} — read ${logPath}.`)),
    );
  });
}

function recordPid(pid?: number): void {
  if (!pid) return;
  const pids: number[] = existsSync(PROCESS_FILE)
    ? (JSON.parse(readFileSync(PROCESS_FILE, 'utf8')) as number[])
    : [];
  pids.push(pid);
  writeFileSync(PROCESS_FILE, JSON.stringify(pids), 'utf8');
}

/**
 * Kills every service this run started, by process group. Global teardown runs in a different
 * process from global setup, which is why the pids are on disk rather than in `children`.
 */
export function stopServices(): void {
  const pids: number[] = existsSync(PROCESS_FILE)
    ? (JSON.parse(readFileSync(PROCESS_FILE, 'utf8')) as number[])
    : [];
  for (const pid of pids) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // Already gone: nothing to stop.
    }
  }
  for (const child of children) child.kill('SIGTERM');
  children.length = 0;
  if (existsSync(PROCESS_FILE)) rmSync(PROCESS_FILE);
}
