/**
 * The two ports `PushRegistrar` talks to, and nothing that imports Firebase.
 *
 * Port of `PushAuthorizing` / `PushTokenSource` in
 * `ios/SkinnyLegend/Core/Push/PushRegistrar.swift`. The live implementations live in
 * `messaging.ts`, behind a dynamic `import('firebase/messaging')`, so this module — which the
 * Account row and the registrar both reach — never drags the SDK into the entry chunk.
 */

/**
 * `UNAuthorizationStatus` with one extra case the phone cannot have: `unsupported`, a browser
 * with no `Notification`, no service worker or no `PushManager` (desktop Safari before 16.4,
 * every iOS browser until the page is installed to the Home Screen, Firefox in private mode).
 * It is deliberately *not* folded into `denied`: nothing the member can do in browser settings
 * fixes it, so the Account row explains rather than points at a switch.
 */
export type PushPermission = 'unknown' | 'notDetermined' | 'authorized' | 'denied' | 'unsupported';

export interface PushAuthorizing {
  /** The browser's current `Notification.permission`, never a prompt. */
  permission(): Promise<PushPermission>;
  /** Shows the browser's permission prompt. Resolves `true` only when it was granted. */
  requestPermission(): Promise<boolean>;
  /** False when this browser cannot receive web push at all — see `unsupported` above. */
  isSupported(): Promise<boolean>;
}

export interface PushTokenSource {
  /** The FCM registration token, or `null` while one cannot be minted yet. */
  currentToken(): Promise<string | null>;
  /** Revokes the token with FCM, so a disabled browser stops being a delivery target. */
  deleteToken(): Promise<void>;
}

/**
 * `PushRegistrar.permission(from:)` on the web. `'default'` is the browser's "not decided yet",
 * which is what iOS calls `.notDetermined`; anything unknown is treated as denied, exactly as
 * the Swift `@unknown default` does.
 */
export function permissionFrom(status: NotificationPermission): PushPermission {
  switch (status) {
    case 'granted':
      return 'authorized';
    case 'default':
      return 'notDetermined';
    default:
      return 'denied';
  }
}

/**
 * The synchronous half of support detection: the three globals web push needs. The full check
 * also asks `firebase/messaging`'s own `isSupported()` (it additionally requires IndexedDB and
 * rules out a few embedded webviews), which costs a dynamic import — so this is what the
 * Account row can call during render.
 */
export function hasPushPrimitives(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * True on an iOS/iPadOS Safari that is *not* running as an installed app. Apple only exposes
 * web push to a page added to the Home Screen, so this is the one unsupported case with a fix
 * the member can act on — the Account row shows `pwa.installBody` instead of a flat "no".
 */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const isIosSafari =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIosSafari) return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return !standalone;
}
