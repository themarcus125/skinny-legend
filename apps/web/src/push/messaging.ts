import type { MessagePayload } from 'firebase/messaging';
import { firebaseOptions } from '@/auth/firebase-config';
import { loadMessaging } from '@/auth/firebase';
import {
  hasPushPrimitives,
  permissionFrom,
  type PushAuthorizing,
  type PushPermission,
  type PushTokenSource,
} from './ports';

/**
 * The live push ports: `Notification` for permission, `firebase/messaging` for the token, and
 * the background service worker the SDK delivers through.
 *
 * **Two service workers, on purpose.** Workbox owns `/sw.js` at scope `/` (the app shell, the
 * offline fallback, the runtime caches). FCM needs its own worker, served from the site root as
 * `/firebase-messaging-sw.js`, and the Firebase SDK registers it under the dedicated scope
 * `/firebase-cloud-messaging-push-scope` — that narrower scope is what lets the two coexist:
 * registering a *different* script for the same scope would replace the existing registration,
 * and the app would lose either its shell cache or its push delivery. The scope is spelled out
 * here rather than left to the SDK's default so the pairing is visible from the code, and
 * `vite.config.ts` keeps Workbox from precaching (or renaming) the FCM worker.
 *
 * The worker cannot read `import.meta.env`, so the Firebase web config — public by design, it
 * ships in every bundle already — travels on the registration URL's query string.
 */

export const PUSH_SW_URL = '/firebase-messaging-sw.js';
export const PUSH_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

/** Where a notification lands when the payload names nothing better. */
export const DEFAULT_DEEP_LINK = '/track';

/** A foreground message, reduced to what the toast renders. */
export interface PushMessage {
  title: string;
  body: string;
  /** An in-app path, never an absolute URL: the toast hands it straight to the router. */
  deepLink: string;
}

function pushRegistration(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams(firebaseOptions() as unknown as Record<string, string>);
  return navigator.serviceWorker.register(`${PUSH_SW_URL}?${params.toString()}`, {
    scope: PUSH_SW_SCOPE,
  });
}

export function livePushAuthorizer(): PushAuthorizing {
  return {
    permission(): Promise<PushPermission> {
      return Promise.resolve(
        hasPushPrimitives() ? permissionFrom(Notification.permission) : 'unsupported',
      );
    },
    async requestPermission(): Promise<boolean> {
      if (!hasPushPrimitives()) return false;
      return (await Notification.requestPermission()) === 'granted';
    },
    async isSupported(): Promise<boolean> {
      // The globals first (synchronous, and true for the vast majority), then the SDK's own
      // check — which is what decides whether `getMessaging` would throw.
      if (!hasPushPrimitives()) return false;
      return (await loadMessaging()) !== null;
    },
  };
}

export function livePushTokens(): PushTokenSource {
  return {
    async currentToken(): Promise<string | null> {
      const sdk = await loadMessaging();
      if (!sdk) return null;
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        // A deployment mistake, not a member-facing failure: without the Web Push certificate
        // FCM cannot mint a token at all. The registrar treats `null` as "not yet", so the
        // toggle stays on and pending rather than showing an error nobody can act on.
        console.error('[push] VITE_FIREBASE_VAPID_KEY is not set; no token can be minted.');
        return null;
      }
      const token = await sdk.mod.getToken(sdk.messaging, {
        vapidKey,
        serviceWorkerRegistration: await pushRegistration(),
      });
      return token === '' ? null : token;
    },
    async deleteToken(): Promise<void> {
      const sdk = await loadMessaging();
      if (!sdk) return;
      await sdk.mod.deleteToken(sdk.messaging);
    },
  };
}

/**
 * Data-only payloads (what `apps/api/src/jobs/notify.ts` sends, so iOS can build its own
 * presentation) carry the copy in `data`; a payload with a `notification` block is accepted too,
 * because the Firebase console's test send uses one.
 */
export function toPushMessage(payload: MessagePayload): PushMessage | null {
  const data = payload.data ?? {};
  const title = data.title ?? payload.notification?.title ?? '';
  const body = data.body ?? payload.notification?.body ?? '';
  if (title === '' && body === '') return null;
  const link = data.deepLink ?? '';
  return { title, body, deepLink: link.startsWith('/') ? link : DEFAULT_DEEP_LINK };
}

/**
 * Foreground messages. The browser shows nothing while the tab is focused — that is the service
 * worker's job when it is not — so the app renders its own toast instead. Returns the
 * unsubscribe; a browser with no messaging support simply never calls back.
 */
export function observeForegroundMessages(handler: (message: PushMessage) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void loadMessaging().then(
    (sdk) => {
      if (!sdk || cancelled) return;
      unsubscribe = sdk.mod.onMessage(sdk.messaging, (payload) => {
        const message = toPushMessage(payload);
        if (message) handler(message);
      });
    },
    (error: unknown) => {
      console.error('[push] loading firebase/messaging failed', error);
    },
  );
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
