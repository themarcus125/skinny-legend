'use client';

import L from 'leaflet';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { CategoryChips } from '@/components/category-chips';
import type { MapPin } from '@/lib/api/types';
import { formatLocalDate } from '@/lib/format';
import { fitBounds, toMarkers, type Marker as PinMarker } from './pin-markers';

/** Default centre before any pins have loaded — District 1, HCMC. */
const HCMC_CENTER: [number, number] = [10.7769, 106.7009];

/** Avatar image or the member's initial, in a 36px circle — matches the design's marker spec. */
function avatarIcon(marker: PinMarker): L.DivIcon {
  const initial = marker.label.charAt(0).toUpperCase();
  const inner = marker.avatarUrl
    ? `<img src="${marker.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
    : `<span style="font:600 13px/1 var(--font-sans, system-ui), sans-serif;">${initial}</span>`;
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;overflow:hidden;background:var(--brand);color:var(--brand-foreground);box-shadow:0 0 0 2px var(--card),0 1px 3px rgba(0,0,0,.28);">${inner}</div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

/** Fits the viewport to every pin once they arrive (initial load and whenever the day filter changes). */
function FitToPins({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    // The container's final size isn't always known the instant Leaflet mounts (it renders inside a
    // client-only dynamic import), so `invalidateSize` first — otherwise fitBounds computes its zoom
    // against a stale (often 0×0) size and overzooms.
    map.invalidateSize();
    const bounds = fitBounds(pins);
    if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
  }, [map, pins]);
  return null;
}

export default function EntryMap({ pins }: { pins: MapPin[] }) {
  const t = useTranslations('map');
  const markers = toMarkers(pins);

  return (
    <MapContainer
      center={HCMC_CENTER}
      zoom={12}
      scrollWheelZoom
      className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-border shadow-card"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FitToPins pins={pins} />
      {markers.map((marker) => (
        <Marker key={marker.key} position={marker.position} icon={avatarIcon(marker)}>
          <Popup>
            <div className="flex w-44 flex-col gap-2">
              {marker.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- R2 serves short-lived signed URLs; next/image would need remotePatterns and would cache them.
                <img
                  src={marker.thumbUrl}
                  alt={t('photoAlt', { date: formatLocalDate(marker.date) })}
                  className="h-24 w-full rounded-sm object-cover"
                />
              ) : null}
              <p className="text-sm font-semibold text-popover-foreground">{marker.label}</p>
              <CategoryChips categories={marker.categories} />
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
