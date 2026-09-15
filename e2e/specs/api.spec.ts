import { expect, test } from '@playwright/test';
import { ADMIN_URL, API_URL, WEB_URL } from '../src/config.js';
import { apiToken, member, resetAll } from '../src/helpers.js';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await resetAll();
});

test('rejects a bad bearer token with 401', async ({ request }) => {
  const response = await request.get(`${API_URL}/leaderboard`, { headers: { Authorization: 'Bearer not-a-token' } });
  expect(response.status()).toBe(401);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('unauthenticated');
});

test('rejects a request with no Authorization header with 401', async ({ request }) => {
  const response = await request.get(`${API_URL}/leaderboard`);
  expect(response.status()).toBe(401);
});

test('refuses a pending member with 403 pending_approval', async ({ request }) => {
  const waiting = await member({ name: 'Chờ', email: 'pending-api@example.com', status: 'pending' });
  const token = await apiToken(waiting);
  const response = await request.get(`${API_URL}/leaderboard`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(403);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('pending_approval');
});

test('refuses a disabled member with 403 disabled', async ({ request }) => {
  const locked = await member({ name: 'Khoá', email: 'disabled-api@example.com', status: 'disabled' });
  const token = await apiToken(locked);
  const response = await request.get(`${API_URL}/leaderboard`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(403);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('disabled');
});

test('returns 400 invalid_body for a malformed presign request', async ({ request }) => {
  const ha = await member({ name: 'Hà', email: 'ha-api@example.com', status: 'active' });
  const token = await apiToken(ha);
  const response = await request.post(`${API_URL}/uploads/presign`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { kind: 'not-a-kind', contentType: 'image/jpeg' },
  });
  expect(response.status()).toBe(400);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe('invalid_body');
});

test('allows both UI origins through CORS and refuses a third', async ({ request }) => {
  for (const origin of [ADMIN_URL, WEB_URL]) {
    const response = await request.fetch(`${API_URL}/health`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    });
    expect(response.headers()['access-control-allow-origin']).toBe(origin);
  }
  const stranger = await request.fetch(`${API_URL}/health`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'GET' },
  });
  expect(stranger.headers()['access-control-allow-origin']).toBeUndefined();
});
