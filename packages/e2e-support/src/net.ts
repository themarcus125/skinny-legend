import { connect } from 'node:net';

/** Resolves true when nothing is accepting TCP connections on the port. */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const settle = (free: boolean) => {
      socket.destroy();
      resolve(free);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => settle(false));
    socket.once('timeout', () => settle(true));
    socket.once('error', () => settle(true));
  });
}

/** Polls until something accepts a connection on the port, or rejects with a one-line failure. */
export async function waitForPort(
  port: number,
  { host = '127.0.0.1', timeoutMs = 120_000 }: { host?: string; timeoutMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortFree(port, host))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`nothing listening on ${host}:${port} after ${Math.round(timeoutMs / 1000)}s`);
}
