import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useLocale } from 'use-intl';
import type { ApiClient } from '@skinny/api-client';
import { onSignOut } from '@/auth/session';
import { useApi } from '@/lib/api';
import { livePushAuthorizer, livePushTokens } from './messaging';
import { createPushRegistrar, type PushRegistrar, type PushRegistrarState } from './registrar';

/**
 * The registrar as React sees it.
 *
 * One registrar per app, not per component: the Account toggle, the post-first-entry prompt and
 * the sign-out teardown all have to move the *same* state machine, the way `AppEnvironment` hands
 * one `PushRegistrar` to every iOS screen. `useSyncExternalStore` is what makes its plain
 * subscription renderable without wrapping the whole app in another provider.
 */

let instance: { api: ApiClient; registrar: PushRegistrar; unregister: () => void } | null = null;

/**
 * The app's registrar for `api`. Re-created only when the client itself changes (mock ↔ live, or
 * one test tree to the next), and the sign-out cleanup is re-registered with it.
 */
export function pushRegistrarFor(api: ApiClient): PushRegistrar {
  if (instance && instance.api === api) return instance.registrar;
  instance?.unregister();
  const registrar = createPushRegistrar({
    api,
    authorizer: livePushAuthorizer(),
    tokens: livePushTokens(),
  });
  const unregister = onSignOut(async (reason) => {
    // A 401 has no token left to authenticate a DELETE with, so it only forgets locally; a
    // deliberate sign-out drops the server row while the ID token is still valid.
    if (reason === 'unauthorized') registrar.clearLocalState();
    else await registrar.resetForSignOut();
  });
  instance = { api, registrar, unregister };
  return registrar;
}

/** Test seam: drops the memoised registrar so the next `pushRegistrarFor` builds a fresh one. */
export function resetPushRegistrar(): void {
  instance?.unregister();
  instance = null;
}

export interface PushView {
  state: PushRegistrarState;
  registrar: PushRegistrar;
  /** The Account toggle. Swallows nothing: the failure lands in `state.errorKey`. */
  setEnabled: (next: boolean) => Promise<void>;
}

/**
 * Subscribes to the registrar and keeps two things honest for as long as the caller is mounted:
 * the browser's current permission (re-read on mount, so a setting changed in another tab turns
 * the toggle off), and the device row's locale (re-registered when the app's language changes).
 *
 * `override` is for tests and previews, which drive a registrar of their own.
 */
export function usePush(override?: PushRegistrar): PushView {
  const api = useApi();
  const registrar = useMemo(() => override ?? pushRegistrarFor(api), [api, override]);
  const state = useSyncExternalStore(
    useCallback((listener: () => void) => registrar.subscribe(listener), [registrar]),
    () => registrar.state,
    () => registrar.state,
  );

  useEffect(() => {
    void registrar.refresh();
  }, [registrar]);

  // The *resolved* language — what the app is rendering in — because the server's push copy
  // follows the app, not the browser. Skipped on the first run: `enable()` already registered
  // with the current value, and a re-POST on every mount would be pure noise.
  const locale = useLocale();
  const lastLocale = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastLocale.current;
    lastLocale.current = locale;
    if (previous === null || previous === locale) return;
    if (!registrar.state.isEnabled) return;
    void registrar.registerCurrentToken();
  }, [locale, registrar]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (next) await registrar.enable();
      else await registrar.disable();
    },
    [registrar],
  );

  return { state, registrar, setEnabled };
}
