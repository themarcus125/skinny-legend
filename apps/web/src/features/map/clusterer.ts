import type { MapPinDto } from '@skinny/shared/wire';
import type { GeoPoint } from '@/lib/geo';

export type { GeoPoint };

/** A group of nearby pins drawn as a single marker. Port of iOS's `MapCluster`. */
export interface MapCluster {
  id: string;
  center: GeoPoint;
  pins: MapPinDto[];
}

/**
 * Nearby pins within this many metres merge into one marker — iOS's
 * `MapModel.clusterRadiusMeters` (ios/SkinnyLegend/Features/Map/MapModel.swift).
 */
export const CLUSTER_RADIUS_M = 50;

/** Mean Earth radius, the same constant the API's `haversineMeters` uses. */
const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Metres between two coordinates — the haversine formula, standing in for iOS's
 * `GeoPoint.distance` (ios/SkinnyLegend/Core/Models/GeoPoint.swift), which delegates to
 * `CLLocation.distance(from:)`.
 *
 * It is the same formula as the API's `haversineMeters` (Task 4) rather than an import of it:
 * the client must not reach into server code, and both sides are pinned by the same ~111 m per
 * 0.001° of latitude assertion. Over the 50 m radius this clusters at, the difference between
 * haversine on a sphere and Core Location's ellipsoid is well under a metre.
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Port of `MapClusterer.cluster` (ios/SkinnyLegend/Features/Map/MapClusterer.swift).
 *
 * Walks `pins` in the order given — the API and the mock both hand them back newest-first — and
 * attaches each one to the **first** existing cluster within `radiusMeters` of that cluster's
 * running mean centre, or starts a new cluster. A cluster's `id` is its first (newest) pin's
 * `entryId`, which is also the pin the marker draws.
 *
 * Greedy and therefore order-dependent: the same pins in a different order can end up in
 * different company (`clusterer.test.ts` pins that down). That is iOS's behaviour, not an
 * accident of this port — and it is cheap enough to re-run on every load without a spatial
 * index, at the spec's 500-pin server-side cap.
 */
export function clusterPins(pins: MapPinDto[], radiusMeters: number): MapCluster[] {
  const clusters: MapCluster[] = [];
  for (const pin of pins) {
    const point: GeoPoint = { lat: pin.lat, lng: pin.lng };
    const existing = clusters.find((cluster) => distanceMeters(cluster.center, point) <= radiusMeters);
    if (!existing) {
      clusters.push({ id: pin.entryId, center: point, pins: [pin] });
      continue;
    }
    existing.pins.push(pin);
    existing.center = {
      lat: existing.pins.reduce((sum, p) => sum + p.lat, 0) / existing.pins.length,
      lng: existing.pins.reduce((sum, p) => sum + p.lng, 0) / existing.pins.length,
    };
  }
  return clusters;
}

/**
 * The south-west / north-east corners covering every cluster centre, or null when there is
 * nothing to fit. Leaflet's `fitBounds` takes exactly this shape.
 */
export function clusterBounds(
  clusters: MapCluster[],
): [[number, number], [number, number]] | null {
  if (clusters.length === 0) return null;
  const lats = clusters.map((cluster) => cluster.center.lat);
  const lngs = clusters.map((cluster) => cluster.center.lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}
