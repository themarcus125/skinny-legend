import { safeDeepLink } from './messaging';

/**
 * The message `public/firebase-messaging-sw.js` posts when a member taps a notification while the
 * app is already open in some window.
 *
 * The worker cannot navigate that window itself: `WindowClient.navigate()` rejects unless the
 * client is controlled by the calling worker, and every app window belongs to Workbox's `/sw.js`
 * at scope `/`, not to the FCM worker at `/firebase-cloud-messaging-push-scope`. So the worker
 * focuses the window and posts the destination here instead, and the router does the rest.
 */
export const DEEP_LINK_MESSAGE = 'deepLink';

/**
 * The in-app path a service-worker message asks for, or `null` if it is not one of ours.
 *
 * Only messages from a same-origin service worker reach `navigator.serviceWorker`, but the
 * `deepLink` itself originally came off the wire in an FCM payload, so it still goes through
 * `safeDeepLink` — the same guard the worker applies — before anything navigates.
 */
export function deepLinkFromMessage(event: MessageEvent): string | null {
  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return null;
  const message = data as { type?: unknown; deepLink?: unknown };
  if (message.type !== DEEP_LINK_MESSAGE) return null;
  return safeDeepLink(typeof message.deepLink === 'string' ? message.deepLink : undefined);
}

/**
 * Subscribes to notification taps forwarded by the FCM worker. Returns the unsubscribe; a browser
 * with no service-worker support simply never calls back.
 */
export function observeServiceWorkerDeepLinks(handler: (path: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined;
  const listener = (event: MessageEvent) => {
    const path = deepLinkFromMessage(event);
    if (path !== null) handler(path);
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => {
    navigator.serviceWorker.removeEventListener('message', listener);
  };
}
