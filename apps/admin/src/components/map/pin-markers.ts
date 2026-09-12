import type { Category, MapPin } from '@/lib/api/types';
import { formatLocalDate } from '@/lib/format';

/** Plain marker shape `entry-map.tsx` renders — no Leaflet types leak in here, so this stays pure and testable. */
export interface Marker {
  key: string;
  position: [number, number];
  label: string;
  avatarUrl: string | null;
  thumbUrl: string | null;
  categories: Category[];
  date: string;
}

/** Maps API/mock pins to markers, in the same order. `label` is "<displayName> · <dd/MM>". */
export function toMarkers(pins: MapPin[]): Marker[] {
  return pins.map((pin) => ({
    key: pin.entryId,
    position: [pin.lat, pin.lng],
    label: `${pin.user.displayName} · ${formatLocalDate(pin.localDate).slice(0, 5)}`,
    avatarUrl: pin.user.avatarUrl,
    thumbUrl: pin.thumbUrl,
    categories: pin.categories,
    date: pin.localDate,
  }));
}

/** Bounding box `[[south, west], [north, east]]` around every pin, or null when there are none. */
export function fitBounds(pins: MapPin[]): [[number, number], [number, number]] | null {
  if (pins.length === 0) return null;

  let minLat = pins[0]!.lat;
  let maxLat = pins[0]!.lat;
  let minLng = pins[0]!.lng;
  let maxLng = pins[0]!.lng;
  for (const pin of pins) {
    minLat = Math.min(minLat, pin.lat);
    maxLat = Math.max(maxLat, pin.lat);
    minLng = Math.min(minLng, pin.lng);
    maxLng = Math.max(maxLng, pin.lng);
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
