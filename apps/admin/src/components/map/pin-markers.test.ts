import { describe, expect, it } from 'vitest';
import type { MapPin } from '@/lib/api/types';
import { fitBounds, toMarkers } from './pin-markers';

function pin(overrides: Partial<MapPin> = {}): MapPin {
  return {
    entryId: 'e-1',
    lat: 10.7769,
    lng: 106.7009,
    placeName: 'California Fitness Q1',
    takenAt: '2026-09-10T01:00:00.000Z',
    localDate: '2026-09-10',
    categories: ['exercise'],
    thumbUrl: 'https://cdn.test/thumb.jpg',
    user: { id: 'u-1', displayName: 'Khoa', avatarUrl: null },
    ...overrides,
  };
}

describe('toMarkers', () => {
  it('maps a pin to its position, label, and passthrough fields', () => {
    const [marker] = toMarkers([pin()]);
    expect(marker).toMatchObject({
      key: 'e-1',
      position: [10.7769, 106.7009],
      label: 'Khoa · 10/09',
      avatarUrl: null,
      thumbUrl: 'https://cdn.test/thumb.jpg',
      categories: ['exercise'],
    });
  });

  it('keeps a set avatarUrl and preserves pin order', () => {
    const markers = toMarkers([
      pin({ entryId: 'e-1', user: { id: 'u-1', displayName: 'Khoa', avatarUrl: 'https://cdn.test/a.jpg' } }),
      pin({ entryId: 'e-2', user: { id: 'u-2', displayName: 'Minh', avatarUrl: null }, localDate: '2026-09-08' }),
    ]);
    expect(markers.map((m) => m.key)).toEqual(['e-1', 'e-2']);
    expect(markers[0]?.avatarUrl).toBe('https://cdn.test/a.jpg');
    expect(markers[1]?.label).toBe('Minh · 08/09');
  });
});

describe('fitBounds', () => {
  it('returns null for an empty pin list', () => {
    expect(fitBounds([])).toBeNull();
  });

  it('returns the min/max box around every pin', () => {
    const bounds = fitBounds([
      pin({ lat: 10.77, lng: 106.70 }),
      pin({ lat: 10.81, lng: 106.65 }),
      pin({ lat: 10.79, lng: 106.71 }),
    ]);
    expect(bounds).toEqual([
      [10.77, 106.65],
      [10.81, 106.71],
    ]);
  });
});
