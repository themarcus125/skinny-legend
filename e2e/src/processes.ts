import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
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
  /**
   * How to recognise *this* service on the port. `E2E_REUSE=1` adopts a listener only when the
   * response to `http://localhost:<port><path>` contains `marker`, so an unrelated process on
   * 3101 is a named failure rather than a suite that silently drives the wrong app.
   */
  identity: { path: string; marker: string };
}

/**
 * `vite preview` binds "localhost", which on this machine is ::1 only, while `next start` and
 * the API bind 0.0.0.0. Probing the name rather than 127.0.0.1 lets Node try both families, so
 * one check covers every service.
 */
const LOOPBACK = 'localhost';

const children: ChildProcess[] = [];

/** True when the listener on the port answers as this service. */
async function answersAsSelf(spec: ProcessSpec): Promise<boolean> {
  try {
    const response = await fetch(`http://${LOOPBACK}:${spec.port}${spec.identity.path}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    return (await response.text()).includes(spec.identity.marker);
  } catch {
    return false;
  }
}

/**
 * Spawns one long-running service, tees its stdout and stderr into e2e/logs/<name>.log (spec
 * §5), and resolves once its port answers. Rejects with a one-line failure that names the log.
 *
 * Ruling R4: under `E2E_REUSE=1` a port that already answers as this service belongs to a
 * previous run's stack and is adopted as is rather than started a second time.
 */
export async function startService(spec: ProcessSpec): Promise<void> {
  if (process.env.E2E_REUSE === '1' && !(await isPortFree(spec.port, LOOPBACK))) {
    if (!(await answersAsSelf(spec))) {
      throw new Error(
        `port ${spec.port} is taken by something that is not ${spec.name} (no "${spec.identity.marker}" at ${spec.identity.path}) — stop it, or re-run without E2E_REUSE=1.`,
      );
    }
    console.log(`[e2e] reusing ${spec.name} already listening on ${spec.port}`);
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, `${spec.name}.log`);
  const log = openLog(logPath);
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own group, so `stopServices` can kill the whole tree (next/vite spawn children).
    detached: true,
  });
  // `end: false` on both: whichever stream finishes first must not close the shared log out
  // from under the other one.
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  children.push(child);
  recordPid(child.pid);

  let exited: number | null = null;
  child.once('exit', (code) => {
    exited = code ?? 0;
    log.end();
  });

  try {
    await waitForPort(spec.port, { host: LOOPBACK, timeoutMs: 180_000 });
  } catch {
    throw new Error(
      `${spec.name} did not come up on port ${spec.port}${exited === null ? '' : ` (it exited with ${exited})`} — read ${logPath}.`,
    );
  }
}

/** A log stream that never throws: a broken log must not take the suite down with it. */
function openLog(logPath: string): WriteStream {
  const log = createWriteStream(logPath, { flags: 'a' });
  log.on('error', (error) => console.error(`[e2e] could not write ${logPath}:`, error));
  return log;
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
  const log = openLog(logPath);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    let code: number | null = null;
    child.once('exit', (exitCode) => {
      code = exitCode;
      log.end();
    });
    // 'close', not 'exit': the tail of the build output is still in flight when the child exits,
    // and a truncated log is exactly what someone reading a build failure needs.
    log.once('close', () =>
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

/** True while any process in the group is still alive. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kills every service this run started, by process group: SIGTERM, up to 5s to go quietly, then
 * SIGKILL. Global teardown runs in a different process from global setup, which is why the pids
 * are on disk rather than in `children`. The pid file is removed only once nothing is left.
 */
export async function stopServices(): Promise<void> {
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

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && pids.some(groupAlive)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const pid of pids) {
    if (!groupAlive(pid)) continue;
    console.error(`[e2e] process group ${pid} ignored SIGTERM — sending SIGKILL`);
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Raced us to exit.
    }
  }

  children.length = 0;
  if (existsSync(PROCESS_FILE)) rmSync(PROCESS_FILE);
}
