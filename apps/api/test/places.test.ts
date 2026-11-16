import { describe, it, expect, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { schema } from '@skinny/shared';
import { db, sql } from '../src/db.js';
import { env } from '../src/env.js';
import { createApp } from '../src/app.js';
import { app, resetDb, asUser } from './helpers.js';
import {
  ATTRIBUTION, NOMINATIM_LOCK_KEY, cellFor, haversineMeters, makePgRateLimiter, nearbyPlaces, type Limiter,
} from '../src/services/places.js';

beforeEach(resetDb);

const HCMC = { lat: 10.7769, lng: 106.7009 };

/**
 * The module-level limiter is the real 1 rps one, and these cases do not exercise it (the
 * `makePgRateLimiter` block does), so they inject a pass-through instead of spending a second of
 * wall clock per assertion.
 */
const fast: Limiter = (task) => task();

/** A Nominatim jsonv2 `/reverse` body, in the shape the service parses. */
function nominatim(body: Record<string, unknown>) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch;
}

function reverseBody(overrides: Record<string, unknown> = {}) {
  return {
    lat: String(HCMC.lat),
    lon: String(HCMC.lng),
    name: 'Phòng gym California Fitness',
    display_name: 'Phòng gym California Fitness, Quận 1, Thành phố Hồ Chí Minh',
    address: { amenity: 'Nhà thi đấu', road: 'Lê Lợi' },
    ...overrides,
  };
}

describe('cellFor', () => {
  it('rounds to three decimals', () => {
    expect(cellFor(10.77694, 106.70091)).toBe('10.777,106.701');
  });
  it('puts two points ~50 m apart in the same cell', () => {
    expect(cellFor(10.7769, 106.7009)).toBe(cellFor(10.77694, 106.70094));
  });
});

describe('haversineMeters', () => {
  it('is zero for the same point and ~111 m for 0.001 degrees of latitude', () => {
    expect(haversineMeters(HCMC, HCMC)).toBe(0);
    expect(haversineMeters(HCMC, { ...HCMC, lat: HCMC.lat + 0.001 })).toBeCloseTo(111, 0);
  });
});

describe('makePgRateLimiter', () => {
  it('runs one task at a time and holds the lock for the rest of the interval', async () => {
    let clock = 0;
    const slept: number[] = [];
    const limit = makePgRateLimiter(sql, 1000, {
      now: () => clock,
      sleep: async (ms) => { slept.push(ms); clock += ms; },
    });
    let running = 0;
    let maxRunning = 0;
    await Promise.all([1, 2, 3].map(() => limit(async () => {
      maxRunning = Math.max(maxRunning, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      clock += 10;
      running--;
    })));
    expect(maxRunning).toBe(1);
    expect(slept).toHaveLength(3);
    expect(slept.every((ms) => ms >= 990)).toBe(true);
  });

  it('spaces task starts across two instances on separate connections', async () => {
    const a = postgres(env.DATABASE_URL, { max: 2, prepare: false });
    const b = postgres(env.DATABASE_URL, { max: 2, prepare: false });
    try {
      const interval = 200;
      const starts: number[] = [];
      const task = async () => { starts.push(performance.now()); };
      const limitA = makePgRateLimiter(a, interval);
      const limitB = makePgRateLimiter(b, interval);
      await Promise.all([limitA(task), limitB(task), limitA(task), limitB(task)]);
      starts.sort((x, y) => x - y);
      expect(starts).toHaveLength(4);
      for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(interval - 5);
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('releases the lock when a task rejects, so the next caller proceeds', async () => {
    const limit = makePgRateLimiter(sql, 0);
    await expect(limit(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects a caller that waits past the lock timeout, so nearbyPlaces degrades', async () => {
    const holder = postgres(env.DATABASE_URL, { max: 1, prepare: false });
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => { locked = resolve; });
    const holding = holder.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${NOMINATIM_LOCK_KEY})`;
      locked();
      await released;
    });
    try {
      await isLocked;
      const limiter = makePgRateLimiter(sql, 0, { lockTimeoutMs: 50 });
      await expect(limiter(async () => 'never')).rejects.toThrow(/lock timeout/);
      const fetchImpl = nominatim(reverseBody());
      const result = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, limiter });
      expect(result).toMatchObject({ places: [], degraded: true });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(await db.select().from(schema.placeCache)).toHaveLength(0);
    } finally {
      release();
      await holding;
      await holder.end();
    }
  });
});

describe('nearbyPlaces', () => {
  it('returns the one named place, tags it osm and upserts the cache', async () => {
    const fetchImpl = nominatim(reverseBody());
    const result = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, limiter: fast });
    expect(result.degraded).toBeUndefined();
    expect(result.attribution).toBe(ATTRIBUTION);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({ name: 'Phòng gym California Fitness', source: 'osm' });
    expect(result.places[0]!.distanceM).toBeLessThanOrEqual(300);
    const rows = await db.select().from(schema.placeCache);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cell).toBe(cellFor(HCMC.lat, HCMC.lng));
  });

  it('calls /reverse only, with the fair-use User-Agent', async () => {
    const fetchImpl = nominatim(reverseBody());
    await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, limiter: fast });
    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/reverse?format=jsonv2&zoom=18');
    expect(url).not.toContain('/search');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^SkinnyLegend\/1\.0 \(\+https:/);
  });

  it('falls back to an address part, then to the first display_name segment', async () => {
    const viaAddress = await nearbyPlaces(HCMC.lat, HCMC.lng, {
      fetch: nominatim(reverseBody({ name: null })), limiter: fast,
    });
    expect(viaAddress.places[0]!.name).toBe('Nhà thi đấu');
    await resetDb();
    const viaDisplay = await nearbyPlaces(HCMC.lat, HCMC.lng, {
      fetch: nominatim(reverseBody({ name: null, address: { road: 'Lê Lợi' } })), limiter: fast,
    });
    expect(viaDisplay.places[0]!.name).toBe('Phòng gym California Fitness');
  });

  it('drops a match beyond the 300 m radius', async () => {
    const far = nominatim(reverseBody({ lat: String(HCMC.lat + 0.02) }));
    const result = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: far, limiter: fast });
    expect(result.places).toEqual([]);
    expect(result.degraded).toBeUndefined();
  });

  it('serves a hit younger than 30 days without fetching', async () => {
    await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: nominatim(reverseBody()), limiter: fast });
    const second = vi.fn() as unknown as typeof fetch;
    const cached = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: second, limiter: fast });
    expect(second).not.toHaveBeenCalled();
    expect(cached.places[0]!.name).toBe('Phòng gym California Fitness');
  });

  it('refetches once the entry is older than 30 days', async () => {
    await db.insert(schema.placeCache).values({
      cell: cellFor(HCMC.lat, HCMC.lng),
      payloadJson: { places: [], attribution: ATTRIBUTION },
      fetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    const fetchImpl = nominatim(reverseBody({ name: 'Công viên Gia Định' }));
    const result = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, limiter: fast });
    expect(fetchImpl).toHaveBeenCalled();
    expect(result.places[0]!.name).toBe('Công viên Gia Định');
  });

  it('degrades to an empty list when Nominatim fails, and caches nothing', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('network down'); }) as unknown as typeof fetch;
    const result = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, limiter: fast });
    expect(result).toMatchObject({ places: [], attribution: ATTRIBUTION, degraded: true });
    expect(await db.select().from(schema.placeCache)).toHaveLength(0);
  });

  it('degrades on a non-200 rather than throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    expect((await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, limiter: fast })).degraded).toBe(true);
    expect(await db.select().from(schema.placeCache)).toHaveLength(0);
  });

  it('degrades on a timeout rather than hanging', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    const result = await nearbyPlaces(HCMC.lat, HCMC.lng, { fetch: fetchImpl, timeoutMs: 20, limiter: fast });
    expect(result.degraded).toBe(true);
  });
});

describe('GET /places/nearby', () => {
  // The handler is stubbed so the suite never reaches the real Nominatim.
  const stubbed = createApp({
    nearby: async (lat, lng) => ({
      places: [{ name: 'Phòng gym California Fitness', lat, lng, distanceM: 12, source: 'osm' as const }],
      attribution: ATTRIBUTION,
    }),
  });

  it('returns the shape for an active member', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await stubbed.request(`/places/nearby?lat=${HCMC.lat}&lng=${HCMC.lng}`, { headers });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attribution).toBe(ATTRIBUTION);
    expect(body.places[0]).toMatchObject({ source: 'osm', distanceM: 12 });
  });

  it('rejects missing or out-of-range coordinates with invalid_body', async () => {
    const { headers } = await asUser('u', { activate: true });
    for (const query of ['', '?lat=10.77', '?lat=200&lng=106.7', '?lat=10.77&lng=999', '?lat=abc&lng=106.7']) {
      const res = await app.request(`/places/nearby${query}`, { headers });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_body');
    }
  });

  it('rejects a pending member with 403 and an anonymous caller with 401', async () => {
    const { headers } = await asUser('p', { pending: true });
    expect((await app.request(`/places/nearby?lat=${HCMC.lat}&lng=${HCMC.lng}`, { headers })).status).toBe(403);
    expect((await app.request(`/places/nearby?lat=${HCMC.lat}&lng=${HCMC.lng}`)).status).toBe(401);
  });
});

describe('POST /me/devices with platform web', () => {
  it('registers a web token', async () => {
    const { headers } = await asUser('u', { activate: true });
    const res = await app.request('/me/devices', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'web-fcm-token', platform: 'web', locale: 'vi' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).device.platform).toBe('web');
  });
});
