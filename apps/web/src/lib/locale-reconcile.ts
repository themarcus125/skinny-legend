import type { UserDto, UserLocale } from '@skinny/api-client';
import { resolveLocale, type LocaleChoice } from '@/i18n/locale';

export interface LocaleReconcileInput {
  /** What is stored locally: `'system'`, `'vi'` or `'en'`. */
  choice: LocaleChoice;
  /** `navigator.language`, e.g. `'en-GB'`. */
  deviceLanguage: string | undefined;
  /** `user.locale` from `POST /auth/session` or `GET /me`. */
  serverLocale: UserLocale;
  userStatus: UserDto['status'];
  /** Ruling R18: no `skinny.locale` key in storage at all — this browser has never chosen. */
  isFreshInstall: boolean;
}

export interface LocaleReconcileResult {
  /** What to write back through `writeLocaleChoice`. */
  store: LocaleChoice;
  /** Non-null means a best-effort `PATCH /me { locale }`. */
  push: UserLocale | null;
}

/**
 * Reconciles this browser's language choice with the one the server holds, on every successful
 * session load.
 *
 * Port of `AppEnvironment.reconcileServerLocale` + `setAppLocale`
 * (`ios/SkinnyLegend/App/AppEnvironment.swift`) — **deliberately not identical to it**
 * (spec §5, ruling R18). iOS only ever pushes: `.system` there still resolves to a concrete
 * language, so the phone always overwrites whatever the console set. A browser is shared with
 * the admin console and a second device, so the web adds the adopting direction:
 *
 * 1. An **explicit** local `vi`/`en` is this browser's source of truth — push it when the server
 *    disagrees, exactly as iOS does.
 * 2. A stored `"system"` **adopts** an explicit server value instead, by converting the local
 *    choice to it: the console (or another client) already said what language this member reads,
 *    and "follow the browser" is the weaker claim.
 * 3. A **fresh install** — no `skinny.locale` key at all — has never told the server anything, so
 *    it pushes the device-resolved language and stores `"system"`, keeping the follow-the-browser
 *    behaviour for later.
 *
 * A disabled account never pushes: `authenticate` (apps/api/src/middleware/auth.ts) rejects
 * `PATCH /me` with 403 before it reaches a handler, so the call could only ever log an error.
 */
export function reconcileLocale(input: LocaleReconcileInput): LocaleReconcileResult {
  const canPush = input.userStatus !== 'disabled';

  // (1) An explicit local choice wins: push it when the server disagrees.
  if (input.choice !== 'system') {
    return {
      store: input.choice,
      push: canPush && input.serverLocale !== input.choice ? input.choice : null,
    };
  }

  // (3) A fresh install has never told the server anything: send what the device resolves to,
  //     and keep "system" so the browser's language keeps being followed.
  if (input.isFreshInstall) {
    return {
      store: 'system',
      push: canPush ? resolveLocale('system', input.deviceLanguage) : null,
    };
  }

  // (2) Otherwise "system" adopts whatever explicit value the server already holds.
  return { store: input.serverLocale, push: null };
}
