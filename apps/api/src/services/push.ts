import { getMessaging } from 'firebase-admin/messaging';
import type { DevicePlatform, NotificationLocale } from '@skinny/shared';
import { env } from '../env.js';
import { firebaseApp } from './firebase.js';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** FCM data payload. The app reads `deepLink` to pick a tab (PushPayload.tab(from:)). */
  data: Record<string, string>;
  /**
   * The platform of the device this token belongs to; decides the wire shape (see `fcmSender`).
   * Defaults to `ios` so a caller that does not know (or care) keeps the APNs-compatible shape.
   */
  platform?: DevicePlatform;
}

export interface PushResult {
  token: string;
  ok: boolean;
  /** True only for `messaging/registration-token-not-registered`: the caller deletes the row. */
  unregistered: boolean;
  error?: string;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

const UNREGISTERED_CODE = 'messaging/registration-token-not-registered';

/**
 * The wire shape for one message, which differs by platform.
 *
 * **iOS** keeps `notification: { title, body }`: APNs needs it to present a banner while the app
 * is backgrounded, and the client reads the same copy back out.
 *
 * **Web** must be DATA-ONLY. With a `notification` block the Firebase JS SDK's own background
 * handler shows a notification itself (no icon, no `tag`, and a tap that goes nowhere because
 * there is no `fcmOptions.link`) *and* still calls `onBackgroundMessage`, so
 * `public/firebase-messaging-sw.js` shows a second one — the member gets every reminder twice and
 * one of the two is a dead tap. Dropping `notification` leaves the worker as the only presenter;
 * the copy travels in `data`, which both the worker and `toPushMessage` already read first.
 */
function toFcmMessage(m: PushMessage) {
  if (m.platform === 'web') {
    return { token: m.token, data: { ...m.data, title: m.title, body: m.body } };
  }
  return {
    token: m.token,
    notification: { title: m.title, body: m.body },
    data: m.data,
    apns: { payload: { aps: { sound: 'default' } } },
  };
}

export function fcmSender(): PushSender {
  return {
    async send(messages) {
      if (messages.length === 0) return [];
      const response = await getMessaging(firebaseApp()).sendEach(messages.map(toFcmMessage));
      return response.responses.map((r, i) => ({
        token: messages[i]!.token,
        ok: r.success,
        unregistered: !r.success && (r.error as { code?: string } | undefined)?.code === UNREGISTERED_CODE,
        error: r.success ? undefined : r.error?.message,
      }));
    },
  };
}

export interface FakeSender extends PushSender {
  /** Every message that "went out", in order. */
  sent: PushMessage[];
  /** Tokens that should fail, keyed by token. */
  failures: Map<string, { unregistered: boolean; error: string }>;
  reset(): void;
}

/** In-memory sender. Used by every test and by any deployment without Firebase credentials. */
export function fakeSender(): FakeSender {
  const sent: PushMessage[] = [];
  const failures = new Map<string, { unregistered: boolean; error: string }>();
  return {
    sent,
    failures,
    reset() {
      sent.length = 0;
      failures.clear();
    },
    async send(messages) {
      return messages.map((m) => {
        const failure = failures.get(m.token);
        if (!failure) {
          sent.push(m);
          return { token: m.token, ok: true, unregistered: false };
        }
        return { token: m.token, ok: false, unregistered: failure.unregistered, error: failure.error };
      });
    },
  };
}

/**
 * FCM is only wired up in AUTH_MODE=firebase — env.ts already requires all three FIREBASE_*
 * vars in that mode (SKI-40/42 preflight ruling), so this does not re-check them ad hoc.
 * Every other mode (including every test run) falls back to the fake sender.
 */
export const hasFirebaseCredentials = env.AUTH_MODE === 'firebase';

export const pushSender: PushSender = hasFirebaseCredentials ? fcmSender() : fakeSender();

/**
 * Picks the one locale to notify a user in, given their registered devices. A user can have
 * more than one device (reinstall, second phone) with different locales; the most recently
 * seen device wins since it best reflects the user's current language. Shared by the notify
 * job and the admin test-send route so locale selection lives in exactly one place.
 */
export function localeFor(devices: Array<{ locale: NotificationLocale; lastSeenAt: Date }>): NotificationLocale {
  if (devices.length === 0) return 'vi';
  return devices.reduce((latest, d) => (d.lastSeenAt > latest.lastSeenAt ? d : latest)).locale;
}
