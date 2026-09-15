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

/** How often a resident app re-checks for a new worker even without leaving the foreground. */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The half `reloadOnWorkerTakeover` cannot do on its own: *finding* the update.
 *
 * A browser only looks for a new service worker on a navigation, or on its own 24-hour timer. An
 * app on the iOS Home Screen does neither — it stays resident for days, and every return to it
 * is a resume, not a load — so a deploy sat unseen until the member force-closed the app. This
 * asks the registration to check on every return to the foreground, whenever the connection
 * comes back, and every `intervalMs` while it stays open. When the check finds a new worker,
 * `autoUpdate` installs it, it claims the page, and `reloadOnWorkerTakeover` reloads onto the
 * new bundle — same route, no force-close.
 *
 * `update()` rejects offline and on a 404 for `sw.js`; both are the browser's business, not a
 * reason to log or retry, so they are swallowed.
 */
export function checkForWorkerUpdates(
  container: { serviceWorker?: ServiceWorkerContainer } = typeof navigator === 'undefined'
    ? {}
    : navigator,
  options: {
    intervalMs?: number;
    document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
    window?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>;
  } = {},
): () => void {
  const serviceWorker = container.serviceWorker;
  if (!serviceWorker) return () => undefined;
  const doc = options.document ?? document;
  const win = options.window ?? window;
  const intervalMs = options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS;

  let registration: ServiceWorkerRegistration | null = null;
  let stopped = false;
  const check = () => {
    if (!registration) return;
    void registration.update().catch(() => undefined);
  };
  const onVisible = () => {
    if (doc.visibilityState === 'visible') check();
  };
  const timer = win.setInterval(check, intervalMs);
  doc.addEventListener('visibilitychange', onVisible);
  win.addEventListener('online', check);
  void serviceWorker.ready
    .then((ready) => {
      if (stopped) return;
      registration = ready;
    })
    .catch(() => undefined);

  return () => {
    stopped = true;
    win.clearInterval(timer);
    doc.removeEventListener('visibilitychange', onVisible);
    win.removeEventListener('online', check);
  };
}
