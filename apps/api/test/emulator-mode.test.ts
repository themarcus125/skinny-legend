import { describe, it, expect, afterEach, vi } from 'vitest';

/** Re-imports a module graph against the currently stubbed process.env. */
async function fresh<T>(specifier: string): Promise<T> {
  vi.resetModules();
  return (await import(specifier)) as T;
}

function stubEmulatorEnv() {
  vi.stubEnv('AUTH_MODE', 'firebase');
  vi.stubEnv('FIREBASE_PROJECT_ID', 'skinny-legend');
  vi.stubEnv('FIREBASE_CLIENT_EMAIL', '');
  vi.stubEnv('FIREBASE_PRIVATE_KEY', '');
  vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099');
  vi.stubEnv('R2_ACCOUNT_ID', 'acc');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
  vi.stubEnv('OPENROUTER_API_KEY', 'or');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('emulator mode', () => {
  it('reports the auth emulator and falls back to the fake push sender', async () => {
    stubEmulatorEnv();
    const push = await fresh<typeof import('../src/services/push.js')>('../src/services/push.js');
    expect(push.usesAuthEmulator).toBe(true);
    expect(push.hasFirebaseCredentials).toBe(false);
    // The fake sender is the only one with a `sent` array (services/push.ts).
    expect(Array.isArray((push.pushSender as { sent?: unknown[] }).sent)).toBe(true);
  });

  it('keeps FCM in plain firebase mode', async () => {
    vi.stubEnv('AUTH_MODE', 'firebase');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'skinny-legend');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'sa@skinny-legend.iam.gserviceaccount.com');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----\\n');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '');
    vi.stubEnv('R2_ACCOUNT_ID', 'acc');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('OPENROUTER_API_KEY', 'or');
    const push = await fresh<typeof import('../src/services/push.js')>('../src/services/push.js');
    expect(push.usesAuthEmulator).toBe(false);
    expect(push.hasFirebaseCredentials).toBe(true);
  });

  it('prefixes every new object key with STORAGE_KEY_PREFIX', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('STORAGE_KEY_PREFIX', 'e2e/');
    const storage = await fresh<typeof import('../src/services/storage.js')>('../src/services/storage.js');
    expect(storage.newKey('photo', 'user-1')).toMatch(/^e2e\/photos\/user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(storage.newKey('thumb', 'user-1')).toMatch(/^e2e\/thumbs\/user-1\//);
    expect(storage.newKey('avatar', 'user-1', 'png')).toMatch(/^e2e\/avatars\/user-1\/.*\.png$/);
  });

  it('leaves keys unprefixed by default', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    const storage = await fresh<typeof import('../src/services/storage.js')>('../src/services/storage.js');
    expect(storage.newKey('photo', 'user-1')).toMatch(/^photos\/user-1\//);
  });

  it('sweeps orphans under the prefixed folders', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('STORAGE_KEY_PREFIX', 'e2e/');
    const storage = await fresh<typeof import('../src/services/storage.js')>('../src/services/storage.js');
    const { cleanupOrphans } = await import('../src/jobs/cleanup.js');
    const objects = (storage.storage as unknown as { objects: Map<string, Buffer> }).objects;
    objects.set('e2e/photos/user-1/orphan.jpg', Buffer.from('x'));
    objects.set('photos/user-1/production.jpg', Buffer.from('x'));
    const { deleted } = await cleanupOrphans(new Date(Date.now() + 48 * 60 * 60 * 1000));
    expect(deleted).toContain('e2e/photos/user-1/orphan.jpg');
    expect(deleted).not.toContain('photos/user-1/production.jpg');
  });
});
