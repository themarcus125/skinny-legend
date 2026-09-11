import { describe, it, expect, beforeEach } from 'vitest';
import { app, resetDb, asUser } from './helpers.js';

beforeEach(resetDb);

describe('POST /uploads/presign', () => {
  it('returns a key and url for a photo', async () => {
    const { headers, user } = await asUser('u1', { activate: true });
    const res = await app.request('/uploads/presign', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'photo', contentType: 'image/jpeg' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(new RegExp(`^photos/${user.id}/[0-9a-f-]+\\.jpg$`));
    expect(body.url).toContain(body.key);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects non-image content types', async () => {
    const { headers } = await asUser('u1', { activate: true });
    const res = await app.request('/uploads/presign', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'photo', contentType: 'application/pdf' }) });
    expect(res.status).toBe(400);
  });

  it('pending users may upload avatars but not photos', async () => {
    const { headers } = await asUser('u1');
    const ok = await app.request('/uploads/presign', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'avatar', contentType: 'image/jpeg' }) });
    expect(ok.status).toBe(200);
    const no = await app.request('/uploads/presign', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'photo', contentType: 'image/jpeg' }) });
    expect(no.status).toBe(403);
  });
});
