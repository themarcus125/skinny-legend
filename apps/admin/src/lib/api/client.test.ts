import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery } from './client';
import { LiveAdminApi } from './live';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stubFetch(...responses: Response[]) {
  const spy = vi.fn();
  for (const response of responses) spy.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildQuery', () => {
  it('omits empty filters', () => {
    expect(buildQuery({})).toBe('');
    expect(buildQuery({ user: 'u-1', status: 'confirmed' })).toBe('?user=u-1&status=confirmed');
    expect(buildQuery({ from: '2026-09-08', to: '2026-09-30' })).toBe('?from=2026-09-08&to=2026-09-30');
  });
});

describe('LiveAdminApi', () => {
  it('sends the bearer token and unwraps the users array', async () => {
    const spy = stubFetch(jsonResponse(200, { users: [{ id: 'u-1', displayName: 'Khoa' }] }));
    const api = new LiveAdminApi('https://api.test', async () => 'tok-123');

    await expect(api.listUsers()).resolves.toEqual([{ id: 'u-1', displayName: 'Khoa' }]);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/admin/users');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
  });

  it('appends the entry filters to the query string', async () => {
    const spy = stubFetch(jsonResponse(200, { entries: [] }));
    const api = new LiveAdminApi('https://api.test', async () => 'tok-123');

    await api.listEntries({ status: 'pending', from: '2026-09-08' });

    expect(spy.mock.calls[0]?.[0]).toBe('https://api.test/admin/entries?status=pending&from=2026-09-08');
  });

  it('throws ApiError carrying the envelope code and message', async () => {
    stubFetch(jsonResponse(403, { error: { code: 'forbidden', message: 'Admin only' } }));
    const api = new LiveAdminApi('https://api.test', async () => 'tok-123');

    const error = await api.listUsers().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden', message: 'Admin only' });
  });

  it('resolves rejectEntry on a 204 with no body', async () => {
    const spy = stubFetch({ ok: true, status: 204, json: async () => null } as Response);
    const api = new LiveAdminApi('https://api.test', async () => 'tok-123');

    await expect(api.rejectEntry('e-1')).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/admin/entries/e-1');
    expect(init.method).toBe('DELETE');
  });

  it('fails fast with a 401 when no token is available', async () => {
    const spy = stubFetch(jsonResponse(200, { users: [] }));
    const api = new LiveAdminApi('https://api.test', async () => null);

    const error = await api.listUsers().catch((err: unknown) => err);

    expect(error).toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('PATCHes a user as JSON and unwraps the user', async () => {
    const spy = stubFetch(jsonResponse(200, { user: { id: 'u-4', status: 'active' } }));
    const api = new LiveAdminApi('https://api.test', async () => 'tok-123');

    await expect(api.patchUser('u-4', { status: 'active' })).resolves.toEqual({ id: 'u-4', status: 'active' });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/admin/users/u-4');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"status":"active"}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });
});
