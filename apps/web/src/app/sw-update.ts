/**
 * The other half of the deploy story (see `route-error.tsx`).
 *
 * `registerType: 'autoUpdate'` ships a worker that calls `skipWaiting()` + `clientsClaim()` +
 * `cleanupOutdatedCaches()`. The moment it claims this page, the old hashed chunks are gone from
 * the precache and Pages answers 404 for them, so every `lazy()` route the member has not visited
 * yet is already broken. Reloading right then swaps in the new `index.html` — and the router keeps
 * the URL, so the member lands back on the screen they were looking at. The cost is unsaved sheet
 * state, which a chunk 404 would have cost them anyway, one tab switch later.
 *
 * The guard is the whole subtlety: on a FIRST install there is no controller yet, and the first
 * `controllerchange` is this very page being claimed by its own new worker — reloading there would
 * make every first visit flash. A page that already has a controller only ever sees
 * `controllerchange` for an update.
 */
export function reloadOnWorkerTakeover(
  container: { serviceWorker?: ServiceWorkerContainer } = typeof navigator === 'undefined'
    ? {}
    : navigator,
  reload: () => void = () => {
    window.location.reload();
  },
): () => void {
  const serviceWorker = container.serviceWorker;
  // No controller: nothing is driving this page yet, so the next change is a first install.
  if (!serviceWorker || !serviceWorker.controller) return () => undefined;
  const onChange = () => {
    reload();
  };
  serviceWorker.addEventListener('controllerchange', onChange, { once: true });
  return () => {
    serviceWorker.removeEventListener('controllerchange', onChange);
  };
}
