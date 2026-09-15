/** A coordinate pair, the only shape `POST /entries` and `GET /places/nearby` care about. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** iOS gives `CLLocationManager` five seconds before giving up (`LocationFixing`); so do we. */
export const GEO_TIMEOUT_MS = 5_000;

/**
 * One location fix, as a promise that never rejects.
 *
 * The web equivalent of iOS's `LocationFixing`: a denial, a timeout, a browser without the API
 * and an insecure origin are all "no fix", not errors. The Track flow treats a missing fix
 * exactly as it treats a photo with no GPS block — the entry is created without coordinates and
 * the place chip simply has nothing to offer.
 *
 * `geolocation` is injectable so the test suite does not need a real permission prompt.
 */
export function currentPosition(
  timeoutMs: number = GEO_TIMEOUT_MS,
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
): Promise<GeoPoint | null> {
  if (!geolocation) return Promise.resolve(null);
  return new Promise<GeoPoint | null>((resolve) => {
    // Guards against a `getCurrentPosition` that calls back twice, and against the browsers
    // that quietly never call back at all when the prompt is dismissed rather than answered.
    let settled = false;
    const settle = (value: GeoPoint | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    try {
      geolocation.getCurrentPosition(
        (position) => settle({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => settle(null),
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
      );
    } catch {
      settle(null);
    }
  });
}
