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

describe('CORS', () => {
  it('answers the admin dashboard preflight with its origin', async () => {
    const app = createApp();
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3001',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH');
  });

  it('does not echo an origin that is not allowed', async () => {
    const app = createApp();
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example' } });

    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });
});
