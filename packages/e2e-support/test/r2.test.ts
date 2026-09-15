import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSweepPrefix, cleanupR2, trackR2Key, trackedR2Keys, type R2Config } from '../src/r2.js';

const CONFIG: R2Config = {
  accountId: 'acct',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  bucket: 'skinny-e2e',
};

let dir: string;
let logPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'e2e-support-r2-'));
  logPath = join(dir, 'keys.log');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Records every command it is handed and answers ListObjectsV2 from a fixed key list. */
function fakeClient(bucketKeys: string[], { pageSize = 1000 } = {}) {
  const sent: unknown[] = [];
  return {
    sent,
    deleted: (): string[] =>
      sent.filter((c) => c instanceof DeleteObjectCommand).map((c) => (c as DeleteObjectCommand).input.Key as string),
    listed: (): unknown[] => sent.filter((c) => c instanceof ListObjectsV2Command),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send: async (command: any): Promise<any> => {
      sent.push(command);
      if (command instanceof ListObjectsV2Command) {
        const prefix = command.input.Prefix ?? '';
        const matching = bucketKeys.filter((k) => k.startsWith(prefix));
        const start = command.input.ContinuationToken ? Number(command.input.ContinuationToken) : 0;
        const page = matching.slice(start, start + pageSize);
        const next = start + pageSize;
        const truncated = next < matching.length;
        return {
          Contents: page.map((Key) => ({ Key })),
          IsTruncated: truncated,
          NextContinuationToken: truncated ? String(next) : undefined,
        };
      }
      return {};
    },
  };
}

describe('trackR2Key / trackedR2Keys', () => {
  it('appends keys and returns them deduped, ignoring blank lines', () => {
    trackR2Key('e2e/run-1/a.jpg', logPath);
    trackR2Key('e2e/run-1/b.jpg', logPath);
    trackR2Key('e2e/run-1/a.jpg', logPath);
    trackR2Key('  e2e/run-1/c.jpg  ', logPath);
    expect(readFileSync(logPath, 'utf8').split('\n').filter(Boolean)).toHaveLength(4);
    expect(trackedR2Keys(logPath)).toEqual(['e2e/run-1/a.jpg', 'e2e/run-1/b.jpg', 'e2e/run-1/c.jpg']);
  });

  it('returns an empty list when nothing has been tracked yet', () => {
    expect(trackedR2Keys(logPath)).toEqual([]);
  });

  it('falls back to E2E_R2_KEY_LOG and complains when neither is set', () => {
    const previous = process.env.E2E_R2_KEY_LOG;
    try {
      process.env.E2E_R2_KEY_LOG = logPath;
      trackR2Key('e2e/run-1/env.jpg');
      expect(trackedR2Keys()).toEqual(['e2e/run-1/env.jpg']);
      delete process.env.E2E_R2_KEY_LOG;
      expect(() => trackedR2Keys()).toThrow('E2E_R2_KEY_LOG is not set');
    } finally {
      if (previous === undefined) delete process.env.E2E_R2_KEY_LOG;
      else process.env.E2E_R2_KEY_LOG = previous;
    }
  });
});

describe('assertSweepPrefix', () => {
  it('rejects an empty prefix and one without a trailing slash', () => {
    expect(() => assertSweepPrefix('')).toThrow('must be non-empty and end with "/"');
    expect(() => assertSweepPrefix('e2e')).toThrow('must be non-empty and end with "/"');
    expect(() => assertSweepPrefix('e2e/run-1')).toThrow('must be non-empty and end with "/"');
  });

  it('accepts a folder prefix', () => {
    expect(() => assertSweepPrefix('e2e/')).not.toThrow();
    expect(() => assertSweepPrefix('e2e/run-1/')).not.toThrow();
  });
});

describe('cleanupR2', () => {
  it('refuses an empty prefix without touching the bucket', async () => {
    trackR2Key('e2e/run-1/a.jpg', logPath);
    const client = fakeClient(['e2e/run-1/a.jpg', 'production/keep.jpg']);
    await expect(cleanupR2({ config: CONFIG, prefix: '', logPath, client })).rejects.toThrow(
      'refusing to sweep R2 with prefix ""',
    );
    expect(client.sent).toEqual([]);
    // The log survives a refused sweep, so nothing is silently forgotten.
    expect(existsSync(logPath)).toBe(true);
  });

  it('refuses a prefix without a trailing slash without touching the bucket', async () => {
    const client = fakeClient(['e2e/run-1/a.jpg', 'e2efoo/other.jpg']);
    await expect(cleanupR2({ config: CONFIG, prefix: 'e2e', logPath, client })).rejects.toThrow(
      'refusing to sweep R2 with prefix "e2e"',
    );
    expect(client.sent).toEqual([]);
  });

  it('deletes only keys under the prefix, from the bucket listing and the log, then removes the log', async () => {
    trackR2Key('e2e/run-1/tracked.jpg', logPath);
    trackR2Key('e2e/run-1/tracked.jpg', logPath);
    trackR2Key('e2e/run-2/other-run.jpg', logPath);
    trackR2Key('production/never.jpg', logPath);
    const client = fakeClient([
      'e2e/run-1/listed.jpg',
      'e2e/run-1/nested/deep.jpg',
      'e2e/run-2/other-run.jpg',
      'e2efoo/sideways.jpg',
      'production/never.jpg',
    ]);

    const deleted = await cleanupR2({ config: CONFIG, prefix: 'e2e/run-1/', logPath, client });

    expect([...deleted].sort()).toEqual(['e2e/run-1/listed.jpg', 'e2e/run-1/nested/deep.jpg', 'e2e/run-1/tracked.jpg']);
    expect([...client.deleted()].sort()).toEqual(deleted.slice().sort());
    expect(deleted).not.toContain('e2efoo/sideways.jpg');
    expect(deleted).not.toContain('production/never.jpg');
    expect(deleted).not.toContain('e2e/run-2/other-run.jpg');
    expect(existsSync(logPath)).toBe(false);
  });

  it('pages through a truncated listing', async () => {
    const keys = Array.from({ length: 5 }, (_, i) => `e2e/run-1/photo-${i}.jpg`);
    const client = fakeClient([...keys, 'production/never.jpg'], { pageSize: 2 });
    const deleted = await cleanupR2({ config: CONFIG, prefix: 'e2e/run-1/', logPath, client });
    expect(deleted.slice().sort()).toEqual(keys.slice().sort());
    expect(client.listed()).toHaveLength(3);
  });

  it('keeps going when a single delete fails', async () => {
    const inner = fakeClient(['e2e/run-1/good.jpg', 'e2e/run-1/bad.jpg']);
    const client = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      send: async (command: any): Promise<any> => {
        if (command instanceof DeleteObjectCommand && command.input.Key === 'e2e/run-1/bad.jpg') {
          throw new Error('boom');
        }
        return inner.send(command);
      },
    };
    const deleted = await cleanupR2({ config: CONFIG, prefix: 'e2e/run-1/', logPath, client });
    expect(deleted).toEqual(['e2e/run-1/good.jpg']);
  });
});
