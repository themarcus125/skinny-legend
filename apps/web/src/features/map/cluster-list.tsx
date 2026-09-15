import type { MapCluster } from './clusterer';
import { MapPinCard } from './pin-card';

/**
 * A multi-pin cluster's detail. Where iOS pushes compact rows that each open a `MapPinCard`
 * (`MapPinListSheet`, ios/SkinnyLegend/Features/Map/MapScreen.swift), the web has no second
 * sheet to push onto: the list simply *is* the cards, scrolled inside the one sheet, which is
 * one interaction shorter and reads the same.
 *
 * Newest first — the cluster preserves the API's order, and its first pin is the one the marker
 * draws, so the card at the top is the face on the map.
 */
export function ClusterList({ cluster }: { cluster: MapCluster }) {
  return (
    <ul data-testid="cluster-list" className="flex flex-col gap-3">
      {cluster.pins.map((pin) => (
        <li key={pin.entryId}>
          <MapPinCard pin={pin} />
        </li>
      ))}
    </ul>
  );
}
