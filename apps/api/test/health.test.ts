import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('unknown routes', () => {
  it('404s with the standard error envelope', async () => {
    const app = createApp();
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });
});
