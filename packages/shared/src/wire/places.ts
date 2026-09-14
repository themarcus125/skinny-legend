import { z } from 'zod';

export const nearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type NearbyQuery = z.infer<typeof nearbyQuery>;

export interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  source: 'osm';
}

export interface NearbyPlacesResponse {
  places: NearbyPlace[];
  attribution: string;
  /** Present and true only when Nominatim failed or timed out; the list is then empty. */
  degraded?: boolean;
}
