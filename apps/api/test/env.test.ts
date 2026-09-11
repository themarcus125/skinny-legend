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
});
