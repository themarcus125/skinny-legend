/*
 * The FCM background worker — the web's `UNUserNotificationCenter` delegate.
 *
 * It is the SECOND service worker this site registers, and that is the supported FCM pattern,
 * not an accident:
 *
 *   - Workbox's `/sw.js` is registered at scope `/` and owns the app shell and the caches.
 *   - This file is served from the site root (Firebase requires the root path) but registered by
 *     `src/push/messaging.ts` at the narrower scope `/firebase-cloud-messaging-push-scope`.
 *
 * Two registrations at the *same* scope would replace one another; two scopes coexist, and a
 * push is delivered to the registration that holds the subscription — this one. `vite.config.ts`
 * keeps Workbox from precaching this file, so it is always fetched fresh from the network and an
 * app update can never serve a stale copy of it from the precache.
 *
 * Plain JS with the compat builds from gstatic, pinned by version: a service worker cannot read
 * `import.meta.env`, and this file is copied verbatim out of `public/` rather than bundled. The
 * Firebase web config — public by design; it is in every client bundle already — arrives on the
 * registration URL's query string.
 */

// Keep in step with the `firebase` dependency in apps/web/package.json.
const FIREBASE_VERSION = '12.19.0';

importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`);
importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`);

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  appId: params.get('appId'),
  messagingSenderId: params.get('messagingSenderId'),
};

/** Where a notification lands when the payload names nothing better. Mirrors `messaging.ts`. */
const DEFAULT_DEEP_LINK = '/track';

/**
 * The bare tab names the API sends on `data.deepLink` (iOS's vocabulary — `PushPayload.tab(from:)`
 * parses them), mapped onto this app's routes. Mirrors `TAB_PATHS` in `src/push/messaging.ts`.
 */
const TAB_PATHS = {
  track: '/track',
  dashboard: '/',
  leaderboard: '/leaderboard',
  trends: '/trends',
  account: '/account',
  feed: '/feed',
  map: '/feed/map',
};

/**
 * A same-origin, in-app path. `//evil.com/x` and `/\\evil.com/x` both start with `/` and both
 * resolve to a different origin, so a `deepLink` off the wire is checked twice: the shape, and
 * then the origin the browser actually resolves it to. A known tab name short-circuits both.
 */
function safeDeepLink(link) {
  if (typeof link !== 'string') return DEFAULT_DEEP_LINK;
  if (Object.prototype.hasOwnProperty.call(TAB_PATHS, link)) return TAB_PATHS[link];
  if (!/^\/(?![/\\])/.test(link)) return DEFAULT_DEEP_LINK;
  try {
    return new URL(link, self.location.origin).origin === self.location.origin
      ? link
      : DEFAULT_DEEP_LINK;
  } catch {
    return DEFAULT_DEEP_LINK;
  }
}

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  /*
   * The notification job sends DATA-ONLY messages (apps/api/src/jobs/notify.ts), so iOS can
   * build its own presentation — which means the browser shows nothing by itself and this
   * handler has to. A payload that does carry a `notification` block (the Firebase console's
   * test send) is honoured the same way rather than being shown twice: `onBackgroundMessage`
   * is not called for those, so there is no double-render to guard against.
   */
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = data.title || (payload.notification && payload.notification.title) || '';
    const body = data.body || (payload.notification && payload.notification.body) || '';
    if (!title && !body) return;
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // One notification per kind: a second reminder replaces the first rather than stacking.
      tag: data.kind || 'skinny-reminder',
      data: { deepLink: safeDeepLink(data.deepLink) },
    });
  });
}

/**
 * Tapping the notification focuses the app if it is already open, and otherwise opens it at the
 * deep link. `waitUntil` keeps the worker alive for the lookup.
 *
 * The focused window is NOT navigated from here. `WindowClient.navigate()` rejects with a
 * `TypeError` unless the client is controlled by the *calling* worker, and every app window is
 * controlled by Workbox's `/sw.js` at scope `/`, never by this worker at
 * `/firebase-cloud-messaging-push-scope`. `postMessage` has no such rule, so the deep link is
 * handed to the app instead and `src/push/deep-link.ts` routes it — which is also nicer: the
 * router navigates without a full reload. `openWindow` still covers the no-window case.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const deepLink = safeDeepLink(data.deepLink);
  const target = new URL(deepLink, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        return Promise.resolve(client.focus()).then((focused) => {
          (focused || client).postMessage({ type: 'deepLink', deepLink });
        });
      }
      return clients.openWindow(target);
    }),
  );
});
