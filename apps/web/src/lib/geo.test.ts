import { describe, expect, it, vi } from 'vitest';
import { currentPosition } from './geo';

/** A hand-driven `Geolocation`, so no test ever waits on a real permission prompt. */
function stubGeolocation(behaviour: Geolocation['getCurrentPosition']): Geolocation {
  return { getCurrentPosition: behaviour, watchPosition: vi.fn(), clearWatch: vi.fn() };
}

describe('currentPosition', () => {
  it('resolves the fix a granted permission produces', async () => {
    const geolocation = stubGeolocation((onSuccess) =>
      onSuccess({ coords: { latitude: 10.77, longitude: 106.7 } } as GeolocationPosition),
    );
    expect(await currentPosition(50, geolocation)).toEqual({ lat: 10.77, lng: 106.7 });
  });

  it('resolves null on a denial rather than rejecting', async () => {
    const geolocation = stubGeolocation((_onSuccess, onError) =>
      onError?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    );
    expect(await currentPosition(50, geolocation)).toBeNull();
  });

  it('resolves null when the browser never calls back', async () => {
    expect(await currentPosition(10, stubGeolocation(() => {}))).toBeNull();
  });

  it('resolves null where the API does not exist at all', async () => {
    expect(await currentPosition(10, undefined)).toBeNull();
  });
});
