import { describe, it, expect, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/index';

function stub(status: number, body: unknown, capture?: (url: string, init: RequestInit) => void) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    capture?.(url, init);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const opts = (fetchImpl: typeof fetch) => ({
  baseUrl: 'https://api.test',
  getToken: async () => 'tok',
  fetch: fetchImpl,
});

describe('createApiClient', () => {
  it('sends the bearer token and unwraps the envelope', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const api = createApiClient(
      opts(
        stub(200, { user: { id: 'u1' } }, (url, init) => {
          seen = { url, init };
        }),
      ),
    );
    await expect(api.session()).resolves.toMatchObject({ id: 'u1' });
    const call = seen as unknown as { url: string; init: RequestInit };
    expect(call.url).toBe('https://api.test/auth/session');
    expect(call.init.method).toBe('POST');
    expect(new Headers(call.init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('throws ApiError carrying the envelope code', async () => {
    const api = createApiClient(opts(stub(403, { error: { code: 'pending_approval', message: 'x' } })));
    await expect(api.dashboard()).rejects.toMatchObject({ status: 403, code: 'pending_approval' });
    await expect(api.dashboard()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws unauthenticated without ever fetching when there is no token', async () => {
    const fetchImpl = stub(200, {});
    const api = createApiClient({ baseUrl: 'https://api.test', getToken: async () => null, fetch: fetchImpl });
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns undefined for a 204 delete', async () => {
    const api = createApiClient(opts(stub(204, null)));
    await expect(api.deleteEntry('e1')).resolves.toBeUndefined();
  });

  it('builds the paged and query endpoints', async () => {
    const urls: string[] = [];
    const api = createApiClient(
      opts(
        stub(200, { entries: [], nextCursor: null, pins: [], places: [], attribution: '' }, (u) => {
          urls.push(u);
        }),
      ),
    );
    await api.feed('2026-09-14T00:00:00.000Z');
    await api.mapPins(7);
    await api.userEntries('u2');
    await api.nearbyPlaces(10.77, 106.7);
    expect(urls).toEqual([
      'https://api.test/feed?cursor=2026-09-14T00%3A00%3A00.000Z',
      'https://api.test/entries/map?days=7',
      'https://api.test/users/u2/entries',
      'https://api.test/places/nearby?lat=10.77&lng=106.7',
    ]);
  });

  it('pins the social endpoints the feed calls live', async () => {
    const calls: string[] = [];
    const bodies: (BodyInit | null | undefined)[] = [];
    const api = createApiClient(
      opts(
        stub(200, { heartCount: 0, heartedByMe: false, comments: [], comment: {}, commentCount: 0 }, (u, init) => {
          calls.push(`${init.method ?? 'GET'} ${u}`);
          bodies.push(init.body);
        }),
      ),
    );
    await api.heartEntry('e1');
    await api.unheartEntry('e1');
    await api.comments('e1');
    await api.postComment('e1', 'Hay');
    expect(calls).toEqual([
      'PUT https://api.test/entries/e1/heart',
      'DELETE https://api.test/entries/e1/heart',
      'GET https://api.test/entries/e1/comments',
      'POST https://api.test/entries/e1/comments',
    ]);
    expect(bodies[3]).toBe('{"body":"Hay"}');

    // The delete answers 204, so it is pinned against a stub that sends no body at all.
    const deleting = createApiClient(
      opts(
        stub(204, null, (u, init) => {
          calls.push(`${init.method ?? 'GET'} ${u}`);
        }),
      ),
    );
    await expect(deleting.deleteComment('c1')).resolves.toBeUndefined();
    expect(calls[4]).toBe('DELETE https://api.test/comments/c1');
  });

  it('sends Content-Type only when there is a body', async () => {
    const seen: RequestInit[] = [];
    const api = createApiClient(
      opts(
        stub(200, { user: { id: 'u1' }, entries: [], nextCursor: null }, (_url, init) => {
          seen.push(init);
        }),
      ),
    );
    await api.myEntries();
    await api.updateMe({ locale: 'en' });
    expect(new Headers(seen[0]!.headers).get('Content-Type')).toBeNull();
    expect(new Headers(seen[1]!.headers).get('Content-Type')).toBe('application/json');
    expect(seen[1]!.body).toBe('{"locale":"en"}');
  });

  it('adds the per-call headers from options.headers (ruling R17)', async () => {
    let seen: RequestInit | null = null;
    const api = createApiClient({
      baseUrl: 'https://api.test',
      getToken: async () => 'tok',
      headers: () => ({ 'x-test-uid': 'uid-khoa' }),
      fetch: stub(200, { user: { id: 'u1' } }, (_url, init) => {
        seen = init;
      }),
    });
    await api.session();
    const call = seen as unknown as RequestInit;
    expect(new Headers(call.headers).get('x-test-uid')).toBe('uid-khoa');
    expect(new Headers(call.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('hits the admin endpoints the console relies on', async () => {
    const urls: string[] = [];
    const api = createApiClient(
      opts(
        stub(200, { users: [], entries: [], feedback: [], notifications: [] }, (u) => {
          urls.push(u);
        }),
      ),
    );
    await api.listUsers();
    await api.listEntries({ status: 'pending', from: '2026-09-08' });
    await api.listFeedback();
    await api.listNotifications();
    expect(urls).toEqual([
      'https://api.test/admin/users',
      'https://api.test/admin/entries?status=pending&from=2026-09-08',
      'https://api.test/admin/feedback',
      'https://api.test/admin/notifications?limit=100',
    ]);
  });
});

describe('admin entry writes', () => {
  it('POSTs a new entry to /admin/entries and hands back what it earned', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const api = createApiClient(
      opts(
        stub(201, { entry: { id: 'e-9', photoUrl: null }, points: 3, capped: false }, (url, init) => {
          seen = { url, init };
        }),
      ),
    );
    const input = { userId: 'u-1', takenAt: '2026-09-09T20:00:00+07:00', categories: ['exercise' as const], title: 'Pilates' };
    await expect(api.addEntry(input)).resolves.toMatchObject({ entry: { id: 'e-9', photoUrl: null }, points: 3, capped: false });
    const call = seen as unknown as { url: string; init: RequestInit };
    expect(call.url).toBe('https://api.test/admin/entries');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(String(call.init.body))).toEqual(input);
  });

  it('PATCHes the time and text of an entry and hands back what it now earns', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const api = createApiClient(
      opts(
        stub(200, { entry: { id: 'e-1', localDate: '2026-09-09' }, points: 0, capped: true }, (url, init) => {
          seen = { url, init };
        }),
      ),
    );
    const patch = { takenAt: '2026-09-09T17:00:00+07:00', title: null, placeName: 'Tao Đàn' };
    await expect(api.patchEntry('e-1', patch)).resolves.toMatchObject({ entry: { localDate: '2026-09-09' }, points: 0, capped: true });
    const call = seen as unknown as { url: string; init: RequestInit };
    expect(call.url).toBe('https://api.test/admin/entries/e-1');
    expect(call.init.method).toBe('PATCH');
    expect(JSON.parse(String(call.init.body))).toEqual(patch);
  });
});
