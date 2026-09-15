import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { AlertBanner, EmptyState, initials } from '@skinny/ui';
import { ChevronRightGlyph, CloseGlyph, MapPinGlyph } from '@/app/icons';
import { LargeTitle } from '@/app/large-title';
import { useModalSheet } from '@/app/use-modal-sheet';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';
import { ClusterList } from './cluster-list';
import { CLUSTER_RADIUS_M, clusterBounds, clusterPins, type MapCluster } from './clusterer';
import { MapPinCard } from './pin-card';

/** Spec §7: the map covers the last 30 days, the same window `MapModel.load` defaults to. */
export const MAP_DAYS = 30;

/** District 1, HCMC — where the map sits before any pin has landed. */
const HCMC_CENTER: [number, number] = [10.7769, 106.7009];
const INITIAL_ZOOM = 12;

/** The marker's avatar diameter, matching iOS's `ClusterPin`. */
const MARKER_SIZE = 36;
/** The 36px avatar plus its 4px ring — what Leaflet has to anchor. */
const MARKER_BOX = MARKER_SIZE + 8;

/**
 * Escapes text destined for a `divIcon`'s `html`.
 *
 * Leaflet takes a raw HTML string, so every interpolated value has to be escaped at the seam —
 * a display name is member-supplied content, and the admin's `entry-map.tsx` interpolating one
 * unescaped is exactly what the final review flagged there.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The marker's markup: the newest pin's initials in a ringed 36px circle, plus a count badge
 * when more than one entry clustered there. Port of `ClusterPin`'s anatomy
 * (ios/SkinnyLegend/Features/Map/MapScreen.swift).
 *
 * Everything in here is `aria-hidden`: the element that carries the name is Leaflet's own
 * `.leaflet-marker-icon` div, which is the focusable node, and it is named in `nameMarker`
 * below. Nothing in this markup may be announced, or the marker reads twice.
 *
 * Inline styles rather than utility classes: Leaflet injects this outside React, and Tailwind v4
 * only compiles classes it can see in the source it scans — a class named here would be correct
 * in the file and absent from the stylesheet. The values are design-system custom properties, so
 * the marker still follows the theme, dark mode included.
 */
export function clusterMarkerHtml(cluster: MapCluster): string {
  const newest = cluster.pins[0];
  const face = escapeHtml(initials(newest?.user.displayName ?? ''));
  const badge =
    cluster.pins.length > 1
      ? `<span data-testid="cluster-count" aria-hidden="true" style="position:absolute;top:-2px;right:-4px;min-width:18px;padding:1px 5px;border-radius:9999px;background:var(--primary);color:var(--primary-foreground);border:1.5px solid var(--card);font:600 11px/1.4 var(--font-sans, system-ui),sans-serif;text-align:center;">${cluster.pins.length}</span>`
      : '';
  return (
    `<div aria-hidden="true" style="position:relative;width:${MARKER_BOX}px;height:${MARKER_BOX}px;">` +
    `<span data-testid="cluster-avatar" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;margin:4px;border-radius:9999px;background:var(--primary-soft);color:var(--foreground);border:1px solid var(--primary-border);box-shadow:0 0 0 3px var(--card),var(--shadow-2);font:700 13px/1 var(--font-sans, system-ui),sans-serif;">${face}</span>` +
    badge +
    `</div>`
  );
}

function clusterIcon(cluster: MapCluster): L.DivIcon {
  return L.divIcon({
    html: clusterMarkerHtml(cluster),
    className: '',
    iconSize: [MARKER_BOX, MARKER_BOX],
    iconAnchor: [MARKER_BOX / 2, MARKER_BOX / 2],
  });
}

/**
 * Fits the viewport to every cluster **once**, on the first load that has pins — iOS's
 * `fitCameraIfNeeded`. A manual pan or zoom afterwards, and the toolbar's "Tải lại", must never
 * yank the map back, so the guard is a ref rather than a dependency.
 *
 * `invalidateSize` first: the container's final size is not always known the instant Leaflet
 * mounts, and `fitBounds` against a stale (often 0×0) size overzooms.
 */
function FitBoundsOnce({ clusters }: { clusters: MapCluster[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const bounds = clusterBounds(clusters);
    if (!bounds) return;
    fitted.current = true;
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
  }, [map, clusters]);
  return null;
}

/**
 * Bản đồ — the group's recent places. Port of `MapScreen`
 * (ios/SkinnyLegend/Features/Map/MapScreen.swift) over Leaflet and OpenStreetMap raster tiles,
 * with `MapClusterer` ported verbatim in `clusterer.ts`.
 *
 * The one behaviour worth spelling out is the refresh: "Tải lại" refetches **without**
 * unmounting the map. React Query keeps the previous `data` while the new request is in flight,
 * so `isPending` is false and this never falls back to the skeleton once pins have landed —
 * which is what `MapModel.load`'s "only the first load shows the spinner" guard buys on iOS,
 * and what keeps the reader's pan and zoom.
 */
export function MapScreen() {
  const t = useTranslations();
  const api = useApi();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<MapCluster | null>(null);

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.mapPins(MAP_DAYS),
    queryFn: () => api.mapPins(MAP_DAYS),
  });

  const clusters = useMemo(() => clusterPins(data ?? [], CLUSTER_RADIUS_M), [data]);
  /**
   * The icons are built with the clusters, not per render: a fresh `DivIcon` makes Leaflet
   * replace the marker's element, which throws away whatever focus or hover was on it.
   */
  const markers = useMemo(
    () => clusters.map((cluster) => ({ cluster, label: markerLabel(cluster, t), icon: clusterIcon(cluster) })),
    [clusters, t],
  );
  const dismiss = useCallback(() => setSelected(null), []);

  return (
    <>
      <LargeTitle
        title={t('map.title')}
        leading={
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('common.back')}
            onClick={() => void navigate('/feed')}
          >
            <ChevronRightGlyph className="size-4 rotate-180" />
          </Button>
        }
      >
        {/*
         * Pull-to-refresh is not available over a map that owns its own gestures, so the
         * refresh lives in the toolbar — the same reason iOS put it there.
         */}
        <Button size="sm" variant="secondary" onClick={() => void refetch()}>
          {t('common.reload')}
        </Button>
      </LargeTitle>

      <div className="flex flex-col gap-3.5 px-4 pt-2 pb-8">
        {error ? (
          <AlertBanner
            tone="destructive"
            title={t('map.loadFailed')}
            description={t(describeError(error))}
            action={
              <Button size="sm" variant="secondary" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}

        {isPending ? (
          <div
            data-testid="map-skeleton"
            aria-busy="true"
            className="bg-surface-2 h-[60vh] min-h-[360px] animate-pulse rounded-xl"
          />
        ) : null}

        {!isPending && !error && clusters.length === 0 ? (
          <EmptyState icon={<MapPinGlyph className="size-8" />} title={t('map.empty')} />
        ) : null}

        {clusters.length > 0 ? (
          <MapContainer
            center={HCMC_CENTER}
            zoom={INITIAL_ZOOM}
            scrollWheelZoom
            className="border-border h-[60vh] min-h-[360px] w-full overflow-hidden rounded-xl border shadow-card"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <FitBoundsOnce clusters={clusters} />
            {markers.map(({ cluster, label, icon }) => (
              /*
               * The key carries the label so a cluster whose contents changed remounts and
               * fires `add` again — `setIcon` alone would rebuild the element and drop the
               * attributes `nameMarker` put on it.
               */
              <Marker
                key={`${cluster.id}:${label}`}
                position={[cluster.center.lat, cluster.center.lng]}
                icon={icon}
                eventHandlers={{
                  add: (event) => nameMarker(event.target as L.Marker, label),
                  click: () => setSelected(cluster),
                }}
              />
            ))}
          </MapContainer>
        ) : null}
      </div>

      {selected ? (
        <ClusterSheet cluster={selected} onDismiss={dismiss} />
      ) : null}
    </>
  );
}

/** React Router 7's lazy-route convention. */
export const Component = MapScreen;

/**
 * Names the marker **element**, which is the one a reader actually lands on.
 *
 * Leaflet gives `.leaflet-marker-icon` `tabindex="0"` (its `keyboard: true` default) but no role
 * and no name. A generic element does not take its name from its contents under the
 * accessible-name spec, so an `aria-label` on anything *inside* the `divIcon` does not name it —
 * and `alt` reaches an `<img>` icon only, never a `divIcon`. So the role and the name go on the
 * element itself, once it has been added to the map, and the icon's own markup stays
 * `aria-hidden` so nothing is announced twice. This is iOS's
 * `.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(.isButton)`.
 *
 * `setAttribute` takes the string as data, so there is no HTML seam to escape here — unlike the
 * initials, which are interpolated into the `divIcon`'s HTML.
 */
export function nameMarker(marker: L.Marker, label: string): void {
  const element = marker.getElement();
  if (!element) return;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', label);
}

/**
 * What a marker reads as: the newest member's name, the entry count when several clustered, and
 * the place name — iOS's `ClusterPin.accessibilityLabel`, joined the same way.
 */
function markerLabel(cluster: MapCluster, t: ReturnType<typeof useTranslations>): string {
  const newest = cluster.pins[0];
  if (!newest) return t('map.title');
  const parts = [newest.user.displayName];
  if (cluster.pins.length > 1) parts.push(t('feed.entryCount', { 0: cluster.pins.length }));
  if (newest.placeName) parts.push(newest.placeName);
  return parts.join(', ');
}

/**
 * The tapped cluster's detail, as a bottom sheet over the map: a single pin is one card, several
 * are the scrollable list. iOS uses two `.sheet`s for the same pair of cases.
 */
function ClusterSheet({ cluster, onDismiss }: { cluster: MapCluster; onDismiss: () => void }) {
  const t = useTranslations();
  const panel = useRef<HTMLDivElement>(null);
  const single = cluster.pins.length === 1 ? cluster.pins[0] : undefined;

  /** The same modality the verdict sheet gets — focus in, trapped, page locked, focus back. */
  useModalSheet({ panelRef: panel, onDismiss });

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* The backdrop dismisses; it is not a control, so it carries no name of its own. */}
      <div
        data-testid="cluster-backdrop"
        aria-hidden="true"
        onClick={onDismiss}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={single ? single.user.displayName : t('common.place')}
        tabIndex={-1}
        data-testid="cluster-sheet"
        className="bg-background relative flex max-h-[85dvh] w-full flex-col gap-3 rounded-t-[18px] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-h3 truncate font-heading">
            {single ? single.user.displayName : t('common.place')}
          </h2>
          <Button size="sm" variant="ghost" aria-label={t('common.close')} onClick={onDismiss}>
            <CloseGlyph className="size-4" />
          </Button>
        </div>
        <div className="-mx-1 overflow-y-auto overscroll-contain px-1">
          {single ? <MapPinCard pin={single} /> : <ClusterList cluster={cluster} />}
        </div>
      </div>
    </div>
  );
}
