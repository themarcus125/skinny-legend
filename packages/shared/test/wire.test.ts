import { describe, it, expect } from 'vitest';
import {
  createEntryBody, patchEntryBody, patchMeBody, registerDeviceBody, presignBody,
  mapQuery, historyQuery, feedQuery, nearbyQuery,
  PLACE_SOURCES, DEVICE_PLATFORMS, CATEGORIES, USER_LOCALES, ENTRY_STATUSES,
  type EntryDto,
} from '../src/index.js';

describe('createEntryBody', () => {
  const valid = { photoKey: 'photos/u/a.jpg', takenAt: '2026-09-14T03:00:00.000Z' };

  it('accepts the minimal body', () => {
    expect(createEntryBody.parse(valid)).toMatchObject(valid);
  });

  it('accepts a place name with a known source', () => {
    const parsed = createEntryBody.parse({ ...valid, placeName: 'Công viên', placeSource: 'poi' });
    expect(parsed.placeSource).toBe('poi');
  });

  it('rejects a takenAt without an offset', () => {
    expect(createEntryBody.safeParse({ ...valid, takenAt: '2026-09-14T03:00:00' }).success).toBe(false);
  });

  it('rejects an unknown place source', () => {
    expect(createEntryBody.safeParse({ ...valid, placeSource: 'mapkit' }).success).toBe(false);
  });
});

describe('patchEntryBody', () => {
  it('requires at least one category', () => {
    expect(patchEntryBody.safeParse({ categories: [] }).success).toBe(false);
    expect(patchEntryBody.parse({ categories: ['meal'] }).categories).toEqual(['meal']);
  });

  it('allows clearing the place name with null', () => {
    expect(patchEntryBody.parse({ categories: ['meal'], placeName: null }).placeName).toBeNull();
  });
});

describe('patchMeBody', () => {
  it('rejects an empty patch', () => {
    expect(patchMeBody.safeParse({}).success).toBe(false);
  });
  it('accepts a locale-only patch', () => {
    expect(patchMeBody.parse({ locale: 'en' })).toEqual({ locale: 'en' });
  });
});

describe('registerDeviceBody', () => {
  it('defaults platform to ios and locale to vi', () => {
    expect(registerDeviceBody.parse({ token: 't' })).toEqual({
      token: 't', platform: 'ios', locale: 'vi',
    });
  });
  it('rejects an unknown platform', () => {
    expect(registerDeviceBody.safeParse({ token: 't', platform: 'android' }).success).toBe(false);
  });
});

describe('presignBody and mapQuery', () => {
  it('accepts the three upload kinds', () => {
    for (const kind of ['photo', 'avatar', 'feedback'] as const) {
      expect(presignBody.parse({ kind, contentType: 'image/jpeg' }).kind).toBe(kind);
    }
  });
  it('coerces and defaults days', () => {
    expect(mapQuery.parse({}).days).toBe(30);
    expect(mapQuery.parse({ days: '7' }).days).toBe(7);
    expect(mapQuery.safeParse({ days: '91' }).success).toBe(false);
  });
});

describe('cursor queries', () => {
  it('accepts an absent cursor and an ISO cursor with offset', () => {
    expect(historyQuery.parse({}).cursor).toBeUndefined();
    expect(feedQuery.parse({ cursor: '2026-09-14T03:00:00.000Z' }).cursor).toBe('2026-09-14T03:00:00.000Z');
  });
  it('rejects a cursor that is not a datetime', () => {
    expect(historyQuery.safeParse({ cursor: '2026-09-14' }).success).toBe(false);
  });
});

describe('nearbyQuery', () => {
  it('coerces lat/lng from query strings', () => {
    expect(nearbyQuery.parse({ lat: '10.77', lng: '106.7' })).toEqual({ lat: 10.77, lng: 106.7 });
  });
  it('rejects an out-of-range latitude', () => {
    expect(nearbyQuery.safeParse({ lat: '91', lng: '0' }).success).toBe(false);
  });
});

describe('literal tuples', () => {
  it('lists every enum value the DB knows today', () => {
    expect(CATEGORIES).toEqual(['exercise', 'meal', 'group']);
    // `web`/`osm` arrive with migration 0003 in a later task; today these must match db/schema.ts.
    expect(PLACE_SOURCES).toEqual(['poi', 'geocode', 'manual', 'none']);
    expect(DEVICE_PLATFORMS).toEqual(['ios']);
    expect(USER_LOCALES).toEqual(['vi', 'en']);
    expect(ENTRY_STATUSES).toEqual(['pending', 'confirmed', 'rejected']);
  });
});

describe('EntryDto', () => {
  it('is structurally what the API returns', () => {
    const entry: EntryDto = {
      id: 'e1', userId: 'u1', photoUrl: 'https://x/p.jpg', thumbUrl: null,
      takenAt: '2026-09-14T03:00:00.000Z', localDate: '2026-09-14', status: 'confirmed',
      categories: ['exercise'], placeName: null, placeSource: 'none',
      createdAt: '2026-09-14T03:00:01.000Z',
    };
    expect(entry.categories).toEqual(['exercise']);
  });
});
