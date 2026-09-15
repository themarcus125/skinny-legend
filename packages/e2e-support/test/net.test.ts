import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { isPortFree, waitForPort } from '../src/net.js';

let server: Server | null = null;

function listen(port: number): Promise<void> {
  return new Promise((resolve) => {
    server = createServer();
    server.listen(port, '127.0.0.1', resolve);
  });
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

describe('net helpers', () => {
  it('reports a free port as free', async () => {
    expect(await isPortFree(3199)).toBe(true);
  });

  it('reports a listening port as taken and waits for it', async () => {
    await listen(3199);
    expect(await isPortFree(3199)).toBe(false);
    await expect(waitForPort(3199, { timeoutMs: 2000 })).resolves.toBeUndefined();
  });

  it('rejects with the port in the message when nothing ever listens', async () => {
    await expect(waitForPort(3198, { timeoutMs: 300 })).rejects.toThrow('nothing listening on 127.0.0.1:3198');
  });
});
