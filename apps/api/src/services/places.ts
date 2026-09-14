import { eq } from 'drizzle-orm';
import { schema, type NearbyPlace, type NearbyPlacesResponse } from '@skinny/shared';
import { db } from '../db.js';

/**
 * Nearby-place lookup for the web PWA's manual place picker (spec §3.1).
 *
 * v1 is deliberately one Nominatim call: `/reverse`, which answers "what is at this point?" with a
 * single named place. `/search` is NOT used — it needs a query string we do not have, and a bounded
 * viewbox search returns a long, mostly irrelevant list for one extra request against a service whose
 * fair-use policy allows one request per second in total. The client pairs the one suggestion we do
 * return with free-text manual entry, which covers everything the list would have.
 */

/** Anything further than this from the caller is not "here", so it is dropped. */
export const NEARBY_RADIUS_M = 300;
/** 30 days: OSM POIs move rarely and a cell is only ~110 m wide, so a stale name costs little. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const NOMINATIM_TIMEOUT_MS = 5_000;
/** Nominatim's fair-use policy requires an identifying UA with a contact URL. */
export const USER_AGENT = 'SkinnyLegend/1.0 (+https://github.com/themarcus125/skinny-legend)';
export const ATTRIBUTION = '© OpenStreetMap contributors';
export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
/** One outbound request per second, in process, as the fair-use policy demands. */
export const MIN_REQUEST_INTERVAL_MS = 1_000;

/** lat/lng rounded to 3 decimals (~110 m) — the place_cache primary key. */
export function cellFor(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

const EARTH_RADIUS_M = 6_371_008.8;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Serialises callers to at most one outbound request per `minIntervalMs`. Tasks queue on a promise
 * chain, so they also run in submission order; a rejected task never stalls the queue behind it.
 * `now`/`sleep` are injectable so the spacing can be asserted without real time passing.
 */
export function makeRateLimiter(
  minIntervalMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Limiter {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = lastStartedAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastStartedAt = now();
      return task();
    });
    // Swallow only on the *queue* copy: the caller still sees the rejection through `run`.
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** Shared by every request this process serves, which is what makes the 1 rps budget global. */
const sharedLimiter = makeRateLimiter(MIN_REQUEST_INTERVAL_MS);

export interface NearbyDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  limiter?: Limiter;
  /** Overridable so a test can assert the timeout path without waiting five real seconds. */
  timeoutMs?: number;
}

/** The subset of a Nominatim jsonv2 `/reverse` body this service reads. */
interface ReverseBody {
  lat?: string;
  lon?: string;
  name?: string | null;
  display_name?: string;
  address?: Record<string, string | undefined>;
}

/**
 * Nominatim's one named place for this point: its own `name` when it has one, else the most
 * specific address part that is a place rather than a street, else the leading segment of
 * `display_name` (which is the house number/road when nothing better exists).
 */
function nameOf(body: ReverseBody): string | null {
  const explicit = body.name?.trim();
  if (explicit) return explicit;
  const address = body.address ?? {};
  for (const key of ['amenity', 'shop', 'leisure', 'building'] as const) {
    const value = address[key]?.trim();
    if (value) return value;
  }
  return body.display_name?.split(',')[0]?.trim() || null;
}

async function reverseLookup(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<NearbyPlace[]> {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`;
  // An explicit controller rather than AbortSignal.timeout so the deadline is injectable.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body: ReverseBody;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'vi', Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
    body = (await res.json()) as ReverseBody;
  } finally {
    clearTimeout(timer);
  }

  const name = nameOf(body);
  const placeLat = Number(body.lat);
  const placeLng = Number(body.lon);
  if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return [];
  const distanceM = Math.round(haversineMeters({ lat, lng }, { lat: placeLat, lng: placeLng }));
  if (distanceM > NEARBY_RADIUS_M) return [];
  return [{ name, lat: placeLat, lng: placeLng, distanceM, source: 'osm' }];
}

/**
 * Cache-first nearby lookup. A hit younger than 30 days never touches the network; a miss goes
 * through the shared 1 rps limiter. Any failure or timeout returns an empty, `degraded: true`
 * body — never a 5xx — and writes nothing, so the next caller retries instead of being served a
 * cached outage for a month.
 */
export async function nearbyPlaces(lat: number, lng: number, deps: NearbyDeps = {}): Promise<NearbyPlacesResponse> {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const limiter = deps.limiter ?? sharedLimiter;
  const timeoutMs = deps.timeoutMs ?? NOMINATIM_TIMEOUT_MS;
  const cell = cellFor(lat, lng);

  const [hit] = await db.select().from(schema.placeCache).where(eq(schema.placeCache.cell, cell));
  if (hit && now().getTime() - hit.fetchedAt.getTime() < CACHE_TTL_MS) {
    return { places: hit.payloadJson.places, attribution: hit.payloadJson.attribution };
  }

  let places: NearbyPlace[];
  try {
    places = await limiter(() => reverseLookup(lat, lng, fetchImpl, timeoutMs));
  } catch (err) {
    console.warn('[places] Nominatim lookup failed', err);
    return { places: [], attribution: ATTRIBUTION, degraded: true };
  }

  const payload = { places, attribution: ATTRIBUTION };
  const fetchedAt = now();
  await db
    .insert(schema.placeCache)
    .values({ cell, payloadJson: payload, fetchedAt })
    .onConflictDoUpdate({ target: schema.placeCache.cell, set: { payloadJson: payload, fetchedAt } });
  return payload;
}
