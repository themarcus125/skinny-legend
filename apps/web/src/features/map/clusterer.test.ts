import { describe, expect, it } from 'vitest';
import type { MapPinDto } from '@skinny/shared/wire';
import { CLUSTER_RADIUS_M, clusterPins, distanceMeters } from './clusterer';

/** The same fixture `MapClustererTests.pin` builds on iOS, in wire shape. */
const pin = (id: string, lat: number, lng: number): MapPinDto => ({
  entryId: id,
  lat,
  lng,
  placeName: null,
  takenAt: '2026-09-10T00:00:00.000Z',
  localDate: '2026-09-10',
  categories: ['exercise'],
  thumbUrl: null,
  user: { id: 'u', displayName: 'U', avatarUrl: null },
});

describe('the ported map clusterer', () => {
  // ── The three Swift cases, one for one (ios/SkinnyLegendTests/MapClustererTests.swift). ──

  it('merges pins within the radius into one cluster with the mean centre', () => {
    const clusters = clusterPins([pin('a', 10.77, 106.7), pin('a2', 10.7701, 106.7001)], 50);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.pins).toHaveLength(2);
    expect(clusters[0]!.center.lat).toBeCloseTo(10.77005, 5);
    expect(clusters[0]!.center.lng).toBeCloseTo(106.70005, 5);
  });

  it('keeps pins farther apart separate', () => {
    expect(clusterPins([pin('a', 10.77, 106.7), pin('b', 10.78, 106.71)], 50)).toHaveLength(2);
  });

  it('yields no clusters for empty input', () => {
    expect(clusterPins([], 50)).toEqual([]);
  });

  // ── The properties the Swift doc comment claims but does not assert. ──

  it("names a cluster after its first (newest) pin's entryId", () => {
    const clusters = clusterPins([pin('newest', 10.77, 106.7), pin('older', 10.7701, 106.7001)], 50);
    expect(clusters[0]!.id).toBe('newest');
    // Newest-first order is the API's, and the cluster keeps it — the pin the marker draws.
    expect(clusters[0]!.pins.map((p) => p.entryId)).toEqual(['newest', 'older']);
  });

  /**
   * The clustering is greedy over a *running mean*, so the input order changes the outcome.
   *
   * The assertion is on cluster MEMBERSHIP, not on how many clusters come out: a chain of three
   * evenly spaced pins yields two clusters in either direction, and it is *who ends up with whom*
   * that actually differs — the middle pin joins whichever end the walk reached first.
   */
  it('is order-dependent: the same pins in a different order cluster differently', () => {
    const a = pin('a', 10.77, 106.7);
    const b = pin('b', 10.7704, 106.7); // ~44 m from a
    const c = pin('c', 10.7708, 106.7); // ~44 m from b, ~89 m from a
    const membership = (pins: MapPinDto[]) =>
      clusterPins(pins, 50).map((cluster) => cluster.pins.map((p) => p.entryId));

    // Walking down: a and b merge, their mean (10.7702) is then ~67 m from c, so c stands alone.
    expect(membership([a, b, c])).toEqual([['a', 'b'], ['c']]);
    // Walking up: c and b merge instead, and a is the one left on its own.
    expect(membership([c, b, a])).toEqual([['c', 'b'], ['a']]);
  });

  it('measures ~111 m for 0.001 degrees of latitude', () => {
    expect(distanceMeters({ lat: 10.77, lng: 106.7 }, { lat: 10.771, lng: 106.7 })).toBeCloseTo(
      111,
      0,
    );
  });

  it('measures zero between a point and itself', () => {
    expect(distanceMeters({ lat: 10.77, lng: 106.7 }, { lat: 10.77, lng: 106.7 })).toBe(0);
  });

  it('clusters at the 50 m radius iOS uses', () => {
    expect(CLUSTER_RADIUS_M).toBe(50);
  });
});
