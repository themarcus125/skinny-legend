import type { ApiClient } from '@skinny/api-client';
import type { UserLocale } from '@skinny/shared/wire';
import { deviceLanguage, readLocaleChoice, resolveLocale } from '@/i18n/locale';
import { ApiError, describeError } from '@/lib/live-client';
import type { PushAuthorizing, PushPermission, PushTokenSource } from './ports';

/**
 * Owns notification permission and FCM token registration on the web — a method-for-method port
 * of `ios/SkinnyLegend/Core/Push/PushRegistrar.swift`, generation counter included.
 *
 * Permission is only ever requested from `enable()` — the Account toggle — or
 * `requestAfterFirstConfirmedEntry()`, never at launch (spec §E). A browser is even stricter
 * than iOS here: `Notification.requestPermission()` outside a user gesture is ignored (Safari)
 * or auto-denied (Chrome's abusive-notification heuristics), and a denial on the web is
 * *permanent* until the member digs into site settings, so an unprompted call does real damage.
 *
 * The one case the phone does not have is `unsupported` (see `ports.ts`); everything else —
 * intent-before-token, pending-until-token, the take-it-back-down branch, the bounded sign-out
 * DELETE — is the Swift file's behaviour, so the two platforms answer `/me/devices` the same way.
 */

/** Mirrors the Account toggle, so a reload renders the right state before `refresh()` lands. */
export const ENABLED_KEY = 'push.isEnabled';
/** Reminders are ON but no token has reached the server yet (see `isRegistrationPending`). */
export const PENDING_KEY = 'push.registrationPending';
/** How long a sign-out waits for `DELETE /me/devices` before giving up on it. */
export const DEFAULT_SIGN_OUT_DEADLINE_MS = 4000;
/** The catalog key shown when a registration failed for a reason the API did not name. */
export const ENABLE_FAILED_KEY = 'push.enableFailed';

/**
 * Set once *this user* has been asked after their first confirmed entry. Scoped per user id and
 * kept across sign-out, so a returning member who explicitly turned reminders OFF is not
 * silently re-enabled by their next confirmed entry, while a different account in the same
 * browser is still asked afresh.
 */
export function didAskKey(userId: string): string {
  return `push.didAsk.${userId}`;
}

export interface PushRegistrarState {
  permission: PushPermission;
  isEnabled: boolean;
  isRegistrationPending: boolean;
  isBusy: boolean;
  /** A catalog key, never a sentence: the row renders it through `t()`. */
  errorKey: string | null;
  registeredToken: string | null;
}

export interface RegistrarDeps {
  api: ApiClient;
  authorizer: PushAuthorizing;
  tokens: PushTokenSource;
  /** Defaults to `localStorage`; a test passes its own so the flags do not leak between cases. */
  storage?: Storage;
  /**
   * A pinned locale (tests). Omitted, the app's *resolved* language is read at every
   * registration — never `navigator.language` — so a language change in Account is what the
   * next `POST /me/devices` carries.
   */
  locale?: () => UserLocale;
  signOutDeadlineMs?: number;
}

export interface PushRegistrar {
  readonly state: PushRegistrarState;
  /** `useSyncExternalStore`'s half of the contract: returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  enable(): Promise<boolean>;
  disable(): Promise<void>;
  registerCurrentToken(): Promise<boolean>;
  handleTokenRefresh(): Promise<void>;
  requestAfterFirstConfirmedEntry(userId: string): Promise<void>;
  clearLocalState(): void;
  resetForSignOut(): Promise<void>;
}

/** Safari in private mode throws on `localStorage` access rather than returning null. */
function safeStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

class Registrar implements PushRegistrar {
  readonly #deps: RegistrarDeps;
  readonly #listeners = new Set<() => void>();
  #snapshot: PushRegistrarState;
  /**
   * Bumped by everything that turns reminders off (`disable()`, sign-out, the 401 teardown).
   * Every registration path snapshots it and re-checks after each `await`, so a continuation
   * that resumes after the member signed out cannot write state or re-`POST` the previous
   * account's token.
   */
  #generation = 0;

  constructor(deps: RegistrarDeps) {
    this.#deps = deps;
    this.#snapshot = {
      permission: 'unknown',
      isEnabled: this.#readFlag(ENABLED_KEY),
      isRegistrationPending: this.#readFlag(PENDING_KEY),
      isBusy: false,
      errorKey: null,
      registeredToken: null,
    };
  }

  get state(): PushRegistrarState {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Re-reads the browser setting. Permission revoked in site settings turns the toggle off,
   * exactly as revoking it in iOS Settings does.
   */
  async refresh(): Promise<void> {
    const permission = await this.#readPermission();
    this.#patch({ permission, errorKey: null });
    if (permission !== 'authorized' && this.#snapshot.isEnabled) {
      this.#setEnabled(false);
      this.#setPending(false);
    }
  }

  /**
   * Account toggle ON. Prompts when undecided, then registers the token. Returns `true` only
   * once the server holds the token; `false` with `isRegistrationPending` set means the toggle
   * is on and the token callback will complete the registration.
   */
  async enable(): Promise<boolean> {
    const generation = this.#generation;
    this.#patch({ isBusy: true, errorKey: null });
    try {
      if (this.#snapshot.permission === 'unknown') await this.refresh();
      if (!this.#isCurrent(generation)) return false;
      if (this.#snapshot.permission === 'notDetermined') {
        let granted = false;
        try {
          granted = await this.#deps.authorizer.requestPermission();
        } catch {
          // A prompt the browser refused to show (no user gesture, Lockdown Mode) is a denial
          // as far as this call is concerned; `refresh()` re-reads the real setting later.
          granted = false;
        }
        if (!this.#isCurrent(generation)) return false;
        this.#patch({ permission: granted ? 'authorized' : 'denied' });
      }
      if (this.#snapshot.permission !== 'authorized') {
        this.#setEnabled(false);
        return false;
      }
      // Intent first: minting an FCM token can outlive this call.
      this.#setEnabled(true);
      const registered = await this.registerCurrentToken();
      if (!this.#isCurrent(generation)) return false;
      if (!registered && !this.#snapshot.isRegistrationPending) this.#setEnabled(false);
      return registered;
    } finally {
      // A sign-out or `disable()` that overtook this call owns `isBusy` from then on.
      if (this.#isCurrent(generation)) this.#patch({ isBusy: false });
    }
  }

  /**
   * Sends the current FCM token to `POST /me/devices`. A token that is not available yet — the
   * push subscription is still being negotiated, or the service worker has not activated — is
   * not an error: the registration is marked pending and `handleTokenRefresh()` retries when
   * one can be minted.
   */
  async registerCurrentToken(): Promise<boolean> {
    const generation = this.#generation;
    if (this.#snapshot.permission === 'unknown') await this.refresh();
    if (!this.#isCurrent(generation) || this.#snapshot.permission !== 'authorized') return false;
    let token: string | null = null;
    try {
      token = await this.#deps.tokens.currentToken();
    } catch {
      token = null;
    }
    if (!this.#isCurrent(generation)) return false;
    if (token === null || token === '') {
      this.#setPending(true);
      return false;
    }
    try {
      await this.#deps.api.registerDevice({ token, platform: 'web', locale: this.#locale() });
      if (!this.#isCurrent(generation)) {
        // The row landed after a `disable()`/sign-out already deleted it. Take it back down
        // unless something re-registered in the meantime (a new account's row must stay). Best
        // effort: after a sign-out the ID token is gone and this simply fails.
        if (!this.#snapshot.isEnabled && !this.#snapshot.isRegistrationPending) {
          try {
            await this.#deps.api.unregisterDevice(token);
          } catch {
            // The job drops the token the first time FCM reports it as unregistered.
          }
        }
        return false;
      }
      this.#patch({ registeredToken: token, errorKey: null });
      this.#setEnabled(true);
      this.#setPending(false);
      return true;
    } catch (error) {
      if (!this.#isCurrent(generation)) return false;
      this.#patch({
        errorKey: error instanceof ApiError ? describeError(error) : ENABLE_FAILED_KEY,
      });
      return false;
    }
  }

  /**
   * The FCM token callback (`onTokenRefresh` has no web equivalent; the app calls this after a
   * service-worker update and whenever the language changes). Only a member who has reminders ON
   * — or whose first registration is still waiting on a token — gets re-registered; a rotated
   * token must never undo `disable()`.
   */
  async handleTokenRefresh(): Promise<void> {
    if (!this.#snapshot.isEnabled && !this.#snapshot.isRegistrationPending) return;
    await this.registerCurrentToken();
  }

  /**
   * Account toggle OFF. Local state is cleared first — so a token callback or an `enable()`
   * still in flight cannot re-register — then the row is dropped and the token revoked with
   * FCM. Best effort: a failed DELETE still leaves the toggle off.
   */
  async disable(): Promise<void> {
    const token = this.#snapshot.registeredToken;
    this.clearLocalState();
    this.#patch({ isBusy: true });
    try {
      await this.#dropRegistration(token);
    } finally {
      this.#patch({ isBusy: false });
    }
  }

  /**
   * Spec §E: "Permission is requested after the user's first confirmed entry, never at launch."
   * Runs at most once per user in this browser, whether or not they say yes.
   */
  async requestAfterFirstConfirmedEntry(userId: string): Promise<void> {
    const key = didAskKey(userId);
    if (this.#readFlag(key)) return;
    this.#writeFlag(key, true);
    await this.enable();
  }

  /**
   * Sign-out. Clears every install-scoped flag synchronously — before any `await`, so nothing
   * in flight can resurrect the previous account's registration — then drops the server-side row
   * while the caller's ID token is still valid, bounded by `signOutDeadlineMs` so an offline
   * sign-out never hangs. The per-user "asked" flag is deliberately kept.
   */
  async resetForSignOut(): Promise<void> {
    const token = this.#snapshot.registeredToken;
    const hadRegistration =
      this.#snapshot.isEnabled || this.#snapshot.isRegistrationPending || token !== null;
    this.clearLocalState();
    if (!hadRegistration) return;
    this.#patch({ isBusy: true });
    try {
      await this.#deleteRow(token, this.#deps.signOutDeadlineMs ?? DEFAULT_SIGN_OUT_DEADLINE_MS);
    } finally {
      this.#patch({ isBusy: false });
    }
  }

  /**
   * The synchronous half of sign-out, also the 401 teardown: forget the registration locally and
   * invalidate every in-flight registration, without touching the server.
   */
  clearLocalState(): void {
    this.#generation += 1;
    this.#patch({ isBusy: false, registeredToken: null, errorKey: null });
    this.#setEnabled(false);
    this.#setPending(false);
  }

  /**
   * `DELETE /me/devices` for `token` (or, after a reload, for whatever FCM hands out now), but
   * never for longer than `deadlineMs`: the live client first waits on a Firebase ID token and
   * then on the request itself, and an offline browser can leave both outstanding for a long
   * time. JavaScript cannot cancel a promise, so the loser is abandoned rather than awaited —
   * which is exactly what the Swift version does with its task group.
   */
  async #deleteRow(token: string | null, deadlineMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, deadlineMs);
    });
    try {
      await Promise.race([this.#dropRegistration(token), deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** The shared body of `disable()` and the sign-out DELETE. Never throws. */
  async #dropRegistration(known: string | null): Promise<void> {
    let token = known;
    if (token === null) {
      try {
        token = await this.#deps.tokens.currentToken();
      } catch {
        token = null;
      }
    }
    if (token === null || token === '') return;
    try {
      await this.#deps.api.unregisterDevice(token);
    } catch {
      // Best effort: the job drops the token the first time FCM reports it as unregistered.
    }
    try {
      await this.#deps.tokens.deleteToken();
    } catch {
      // Revoking with FCM is belt-and-braces; the server row is already gone.
    }
  }

  async #readPermission(): Promise<PushPermission> {
    if (!(await this.#deps.authorizer.isSupported())) return 'unsupported';
    return this.#deps.authorizer.permission();
  }

  #locale(): UserLocale {
    return this.#deps.locale?.() ?? resolveLocale(readLocaleChoice(), deviceLanguage());
  }

  #isCurrent(snapshot: number): boolean {
    return snapshot === this.#generation;
  }

  #patch(partial: Partial<PushRegistrarState>): void {
    this.#snapshot = { ...this.#snapshot, ...partial };
    for (const listener of this.#listeners) listener();
  }

  #setEnabled(value: boolean): void {
    this.#writeFlag(ENABLED_KEY, value);
    this.#patch({ isEnabled: value });
  }

  #setPending(value: boolean): void {
    this.#writeFlag(PENDING_KEY, value);
    this.#patch({ isRegistrationPending: value });
  }

  #readFlag(key: string): boolean {
    try {
      return safeStorage(this.#deps.storage)?.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  #writeFlag(key: string, value: boolean): void {
    try {
      safeStorage(this.#deps.storage)?.setItem(key, value ? '1' : '0');
    } catch {
      // A full or blocked store just means the toggle forgets across reloads.
    }
  }
}

export function createPushRegistrar(deps: RegistrarDeps): PushRegistrar {
  return new Registrar(deps);
}
