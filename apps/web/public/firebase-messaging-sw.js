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
    const deepLink = typeof data.deepLink === 'string' && data.deepLink.startsWith('/')
      ? data.deepLink
      : DEFAULT_DEEP_LINK;
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // One notification per kind: a second reminder replaces the first rather than stacking.
      tag: data.kind || 'skinny-reminder',
      data: { deepLink },
    });
  });
}

/**
 * Tapping the notification focuses the app if it is already open — navigating that tab to the
 * deep link — and otherwise opens it there. `waitUntil` keeps the worker alive for the lookup.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = typeof data.deepLink === 'string' && data.deepLink.startsWith('/')
    ? data.deepLink
    : DEFAULT_DEEP_LINK;
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        return client.focus().then((focused) => {
          const win = focused || client;
          return 'navigate' in win ? win.navigate(target) : undefined;
        });
      }
      return clients.openWindow(target);
    }),
  );
});
