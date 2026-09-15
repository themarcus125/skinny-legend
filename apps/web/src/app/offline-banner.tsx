import { useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * `navigator.onLine` plus the two events, read through `useSyncExternalStore` so React never
 * paints a value that is already out of date (a `useEffect` would miss a transition that happens
 * between render and commit). The server snapshot is `true`: there is no prerender today, and
 * "assume online" is the state that shows no chrome.
 *
 * This is deliberately *only* the browser's own answer. React-query's `onlineManager` reads the
 * same signal for its `refetchOnReconnect`; asking it here instead would couple a piece of shell
 * chrome to the query client for no extra truth — the browser's flag is as wrong (a captive
 * portal reads as online) either way.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true,
  );
}

/**
 * The offline strip. `role="status"` (polite): losing the connection is worth announcing, but not
 * worth interrupting whatever the reader is doing — nothing on screen has broken, the data is
 * simply the last thing the persister saw (`src/lib/persist.ts`).
 *
 * It renders above the shell's scroll container rather than inside it, so it cannot end up under
 * the sticky large title or scroll out of sight while the connection is still down.
 */
export function OfflineBanner() {
  const t = useTranslations();
  const online = useIsOnline();
  if (online) return null;

  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="bg-warning-soft px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] text-center text-warning type-caption font-semibold"
    >
      {t('common.offline')}
    </div>
  );
}
