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
 * asks the registration to check as soon as it is ready, on every return to the foreground,
 * whenever the connection comes back, and every `intervalMs` while it stays open. The boot-time
 * check matters most on iOS: WebKit does not look for a new worker on a plain reload the way
 * Chrome does, so without it a stale app could reload forever onto the same old worker. When
 * the check finds a new worker,
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
      check();
    })
    .catch(() => undefined);

  return () => {
    stopped = true;
    win.clearInterval(timer);
    doc.removeEventListener('visibilitychange', onVisible);
    win.removeEventListener('online', check);
  };
}

/** How long a recovery waits for a new worker to claim the page before wiping and reloading. */
export const RECOVERY_TAKEOVER_WAIT_MS = 4000;

/**
 * The "Tải lại ngay" button's recovery, for a page that has reloaded onto a stale worker.
 *
 * A plain reload can loop on iOS: the old worker answers the navigation from its precache and
 * WebKit never goes looking for the new one. So this asks the registration for an update and
 * gives a new worker `waitMs` to claim the page — `reloadOnWorkerTakeover` reloads the moment
 * it does. If nothing has taken over by then, the worker registrations and every cache are
 * removed and the page reloads straight from the network. That is the one thing that cannot
 * leave the member where they were.
 */
export async function recoverFromStaleWorker(
  container: { serviceWorker?: ServiceWorkerContainer } = typeof navigator === 'undefined'
    ? {}
    : navigator,
  options: {
    caches?: Pick<CacheStorage, 'keys' | 'delete'>;
    reload?: () => void;
    waitMs?: number;
    wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<'takeover' | 'reset'> {
  const reload = options.reload ?? (() => window.location.reload());
  const waitMs = options.waitMs ?? RECOVERY_TAKEOVER_WAIT_MS;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const serviceWorker = container.serviceWorker;
  if (!serviceWorker) {
    reload();
    return 'reset';
  }

  let takenOver = false;
  const onChange = () => {
    takenOver = true;
  };
  serviceWorker.addEventListener('controllerchange', onChange, { once: true });
  try {
    const registration = await serviceWorker.getRegistration();
    await registration?.update().catch(() => undefined);
    await wait(waitMs);
  } catch {
    /* fall through to the reset */
  } finally {
    serviceWorker.removeEventListener('controllerchange', onChange);
  }
  if (takenOver) return 'takeover';

  try {
    const registrations = await serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    /* no registrations to drop */
  }
  const store = options.caches ?? (typeof caches === 'undefined' ? undefined : caches);
  if (store) {
    try {
      const keys = await store.keys();
      await Promise.all(keys.map((key) => store.delete(key)));
    } catch {
      /* nothing cached, or storage locked down */
    }
  }
  reload();
  return 'reset';
}
