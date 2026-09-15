import { describe, it, expect, afterEach, vi } from 'vitest';

/** Re-evaluates src/env.ts against the currently stubbed process.env. */
async function importEnv() {
  vi.resetModules();
  return import('../src/env.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('env', () => {
  it('refuses to boot with AUTH_MODE=test in production', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(importEnv()).rejects.toThrow('AUTH_MODE=test is not allowed in production');
  });

  it('requires the FIREBASE_* vars when AUTH_MODE=firebase', async () => {
    vi.stubEnv('AUTH_MODE', 'firebase');
    vi.stubEnv('FIREBASE_PROJECT_ID', '');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', '');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '');
    await expect(importEnv()).rejects.toThrow(/FIREBASE_PRIVATE_KEY/);
  });

  it('requires the R2 and OpenRouter secrets outside test mode', async () => {
    vi.stubEnv('AUTH_MODE', 'firebase');
    vi.stubEnv('R2_ACCOUNT_ID', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(importEnv()).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it('parses cleanly in test mode', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    const { env } = await importEnv();
    expect(env.AUTH_MODE).toBe('test');
  });

  it('allows firebase mode without a service account when the auth emulator host is set', async () => {
    vi.stubEnv('AUTH_MODE', 'firebase');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'skinny-legend');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', '');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', '');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099');
    vi.stubEnv('R2_ACCOUNT_ID', 'acc');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('OPENROUTER_API_KEY', 'or');
    const { env } = await importEnv();
    expect(env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099');
  });

  it('still requires FIREBASE_PROJECT_ID with the auth emulator host set', async () => {
    vi.stubEnv('AUTH_MODE', 'firebase');
    vi.stubEnv('FIREBASE_PROJECT_ID', '');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099');
    vi.stubEnv('R2_ACCOUNT_ID', 'acc');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('OPENROUTER_API_KEY', 'or');
    await expect(importEnv()).rejects.toThrow(/FIREBASE_PROJECT_ID/);
  });

  it('refuses to boot with the auth emulator host set in production', async () => {
    vi.stubEnv('AUTH_MODE', 'firebase');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'skinny-legend');
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099');
    vi.stubEnv('R2_ACCOUNT_ID', 'acc');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('OPENROUTER_API_KEY', 'or');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(importEnv()).rejects.toThrow('FIREBASE_AUTH_EMULATOR_HOST is not allowed in production');
  });

  it('defaults STORAGE_KEY_PREFIX to an empty string', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    const { env } = await importEnv();
    expect(env.STORAGE_KEY_PREFIX).toBe('');
  });

  it('normalises a STORAGE_KEY_PREFIX without a trailing slash', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('STORAGE_KEY_PREFIX', 'e2e');
    const { env } = await importEnv();
    expect(env.STORAGE_KEY_PREFIX).toBe('e2e/');
  });

  it('leaves a STORAGE_KEY_PREFIX that already ends in a slash alone', async () => {
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('STORAGE_KEY_PREFIX', 'e2e/');
    const { env } = await importEnv();
    expect(env.STORAGE_KEY_PREFIX).toBe('e2e/');
  });
});
