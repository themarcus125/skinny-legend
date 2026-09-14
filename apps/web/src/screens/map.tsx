import { PlaceholderScreen } from './placeholder';

/** MapScreen — /feed/map, Leaflet with 50 m clustering (Task 10). */
export function Component() {
  return <PlaceholderScreen titleKey="map.title" bodyKey="map.empty" />;
}

Component.displayName = 'MapScreen';
