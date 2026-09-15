import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Playwright's global setup, the workers and the global teardown are separate processes, so the
 * tracked keys live in a file rather than in module state. `E2E_R2_KEY_LOG` names it; the
 * config sets it (Task 5).
 */
function logFile(logPath?: string): string {
  const path = logPath ?? process.env.E2E_R2_KEY_LOG;
  if (!path) throw new Error('E2E_R2_KEY_LOG is not set: the Playwright config must define it');
  return path;
}

export function trackR2Key(key: string, logPath?: string): void {
  appendFileSync(logFile(logPath), `${key}\n`, 'utf8');
}

export function trackedR2Keys(logPath?: string): string[] {
  const path = logFile(logPath);
  if (!existsSync(path)) return [];
  return [
    ...new Set(
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

export function r2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

/**
 * Deletes every object this run created: the tracked keys, plus everything currently under the
 * run's prefix (a presign the suite never saw still lands in the bucket). Returns what it
 * deleted. Never throws on a single failed delete — teardown must finish.
 */
export async function cleanupR2({
  config,
  prefix,
  logPath,
}: {
  config: R2Config;
  prefix: string;
  logPath?: string;
}): Promise<string[]> {
  const client = r2Client(config);
  const keys = new Set(trackedR2Keys(logPath));
  let ContinuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken }),
    );
    for (const object of page.Contents ?? []) if (object.Key) keys.add(object.Key);
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);

  const deleted: string[] = [];
  for (const key of keys) {
    // Never reach outside the run's own prefix, whatever ended up in the log.
    if (!key.startsWith(prefix)) continue;
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      deleted.push(key);
    } catch (error) {
      console.error(`[e2e] could not delete r2://${config.bucket}/${key}:`, error);
    }
  }
  const path = logPath ?? process.env.E2E_R2_KEY_LOG;
  if (path && existsSync(path)) rmSync(path);
  return deleted;
}
