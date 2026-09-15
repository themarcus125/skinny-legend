import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiClient, UserDto } from '@skinny/api-client';
import { deviceLanguage, isFreshInstall, readLocaleChoice, writeLocaleChoice } from '@/i18n/locale';
import { useOptionalLocaleChoice } from '@/i18n/provider';
import { ApiError, currentServices, describeError, isFirebaseMisconfigured, useApi } from '@/lib/api';
import { reconcileLocale } from '@/lib/locale-reconcile';
import { firebaseAuthPort, mockAuthPort, SIGN_IN_CANCELLED, type AuthPort } from './firebase';

/**
 * Port of `AppEnvironment.SessionState` (`ios/SkinnyLegend/App/AppEnvironment.swift`).
 *
 * `disabled` carries `UserDto | null` because the account can be reached two ways: a
 * `status: 'disabled'` body from `POST /auth/session`, or — the normal shape against the real
 * API — a 403 `disabled` thrown by `authenticate` (apps/api/src/middleware/auth.ts) before any
 * handler returns a body at all.
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'pending'; user: UserDto }
  | { status: 'disabled'; user: UserDto | null }
  | { status: 'active'; user: UserDto }
  | { status: 'error'; messageKey: string };

/**
 * A failed Google sign-in, carrying the catalog key the sign-in screen renders **inline**.
 *
 * Deliberately a rejection rather than a `SessionState`: `SessionGate` handles `error` before it
 * routes, so putting a sign-in failure in the session state would unmount the very screen the
 * member is trying to use and offer them a "Thử lại" that re-reads `GET /me` while signed out.
 * The failure belongs to the screen, not to the session.
 */
export class SignInError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
    this.name = 'SignInError';
  }
}

export interface SessionActions {
  /**
   * Google sign-in. A cancelled popup resolves quietly; any other failure rejects with a
   * `SignInError` for the caller to render inline. The session state is never touched.
   */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Replaces the session's user row after a profile edit, without a round trip. */
  setUser: (user: UserDto) => void;
  /** Re-reads `GET /me` — the "Kiểm tra lại" button, and the error screen's retry. */
  refresh: () => Promise<void>;
  /** True while `signIn`/`signOut` are in flight, so the buttons can disable themselves. */
  isWorking: boolean;
}

export type SessionValue = SessionState & SessionActions;

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Cleanup the rest of the app registers for sign-out — clearing the install-scoped push flags,
 * mirroring `PushRegistrar.resetForSignOut` / `clearLocalState()` on iOS. `src/push/use-push.ts`
 * registers the push half; the set is the seam, so `session.tsx` never imports the registrar
 * (and a tree that never mounts the reminders row never loads it).
 *
 * Which of the two teardowns is running. They are *not* the same call, which is why the reason
 * is passed rather than inferred: a deliberate sign-out still holds a valid ID token, so the
 * push registration is dropped server-side (`resetForSignOut`), while a 401 means the token is
 * already gone — there is nothing left to authenticate a `DELETE /me/devices` with, so the
 * registrar only forgets it locally (`clearLocalState`) and the notification job drops the row
 * the first time FCM reports the token as unregistered.
 */
export type SignOutReason = 'signOut' | 'unauthorized';
type SignOutCleanup = (reason: SignOutReason) => void | Promise<void>;
const cleanups = new Set<SignOutCleanup>();

/** Registers a sign-out cleanup. Returns the unregister. */
export function onSignOut(cleanup: SignOutCleanup): () => void {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

async function runCleanups(reason: SignOutReason): Promise<void> {
  for (const cleanup of cleanups) {
    try {
      await cleanup(reason);
    } catch (error) {
      console.error('[auth] sign-out cleanup failed', error);
    }
  }
}

/** `apply(_:)` on iOS: `POST /auth/session` returns the row with its status, so routing reads it. */
function stateForUser(user: UserDto): SessionState {
  switch (user.status) {
    case 'active':
      return { status: 'active', user };
    case 'pending':
      return { status: 'pending', user };
    case 'disabled':
      return { status: 'disabled', user };
  }
}

export function SessionProvider({ children, auth }: { children: ReactNode; auth?: AuthPort }) {
  const api = useApi();
  const queryClient = useQueryClient();
  // Outside a `LocaleProvider` (a focused test tree) the stored choice is still written; inside
  // one, `setChoice` writes it *and* re-renders the tree in the adopted language.
  const locale = useOptionalLocaleChoice();
  const setChoice = locale?.setChoice ?? writeLocaleChoice;

  const port = useMemo(
    () => auth ?? (currentServices() === 'mock' ? mockAuthPort() : firebaseAuthPort()),
    [auth],
  );

  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [isWorking, setIsWorking] = useState(false);

  // Guards against a slow `/auth/session` finishing after a newer sign-out (or sign-in) has
  // already moved the state on. Every intentional transition bumps it; the loader captures the
  // value it started with and drops its result if the counter has since moved.
  const generation = useRef(0);

  /**
   * Best-effort locale reconciliation (ruling R18, spec §5). A failed `PATCH` is logged, never
   * surfaced: the local preference is this browser's source of truth and the next sign-in
   * retries.
   */
  const reconcile = useCallback(
    async (user: UserDto): Promise<UserDto> => {
      const { store, push } = reconcileLocale({
        choice: readLocaleChoice(),
        deviceLanguage: deviceLanguage(),
        serverLocale: user.locale,
        userStatus: user.status,
        // Read before `setChoice` writes the key, or every launch would look fresh.
        isFreshInstall: isFreshInstall(),
      });
      setChoice(store);
      if (!push) return user;
      try {
        return await api.updateMe({ locale: push });
      } catch (error) {
        // Swallowed on purpose, a 401 included: the session load that got us here already
        // succeeded, so a token that expired between the two calls is the next request's
        // problem, not a reason to bounce the member out of a screen they can still read.
        console.error('[auth] PATCH /me { locale } failed', error);
        return user;
      }
    },
    [api, setChoice],
  );

  const handleFailure = useCallback(
    async (error: unknown): Promise<SessionState> => {
      // 401 anywhere means the token is gone or revoked: sign out rather than show an error,
      // and clear the install-scoped local state so it cannot leak into the next account.
      if (error instanceof ApiError && error.status === 401) {
        await runCleanups('unauthorized');
        queryClient.clear();
        try {
          await port.signOut();
        } catch (signOutError) {
          console.error('[auth] sign-out after 401 failed', signOutError);
        }
        return { status: 'signedOut' };
      }
      // A 403 `disabled` is the *normal* shape for a disabled account against the real API —
      // `authenticate` rejects before any handler returns a body — so it routes to its own
      // state rather than the generic retry screen.
      if (error instanceof ApiError && error.code === 'disabled') {
        return { status: 'disabled', user: null };
      }
      return { status: 'error', messageKey: describeError(error) };
    },
    [port, queryClient],
  );

  const load = useCallback(
    async (mine: number, read: (client: ApiClient) => Promise<UserDto>) => {
      try {
        const user = await read(api);
        if (generation.current !== mine) return;
        const reconciled = await reconcile(user);
        if (generation.current !== mine) return;
        setState(stateForUser(reconciled));
      } catch (error) {
        const next = await handleFailure(error);
        if (generation.current !== mine) return;
        setState(next);
      }
    },
    [api, handleFailure, reconcile],
  );

  useEffect(() => {
    // A production build with no Firebase project never gets here — `ConfigurationError` below
    // renders instead — so `observe()` can safely stand Firebase up.
    return port.observe((signedIn) => {
      generation.current += 1;
      const mine = generation.current;
      if (!signedIn) {
        queryClient.clear();
        setState({ status: 'signedOut' });
        return;
      }
      setState({ status: 'loading' });
      void load(mine, (client) => client.session());
    });
  }, [load, port, queryClient]);

  const signIn = useCallback(async () => {
    setIsWorking(true);
    try {
      await port.signInWithGoogle();
    } catch (error) {
      if (error instanceof Error && error.message === SIGN_IN_CANCELLED) return;
      // The real cause (popup blocked, unauthorised domain, misconfigured consent screen) stays
      // in the console; the member only ever sees the catalog message, under the button.
      console.error('[auth] Google sign-in failed', error);
      throw new SignInError('auth.failed');
    } finally {
      setIsWorking(false);
    }
  }, [port]);

  const signOut = useCallback(async () => {
    setIsWorking(true);
    generation.current += 1;
    try {
      await runCleanups('signOut');
      queryClient.clear();
      await port.signOut();
      setState({ status: 'signedOut' });
    } catch (error) {
      console.error('[auth] sign-out failed', error);
      // Local state is already cleared; the member is signed out as far as this browser cares.
      setState({ status: 'signedOut' });
    } finally {
      setIsWorking(false);
    }
  }, [port, queryClient]);

  const setUser = useCallback((user: UserDto) => {
    setState((previous) =>
      previous.status === 'active' || previous.status === 'pending'
        ? stateForUser(user)
        : previous,
    );
  }, []);

  const refresh = useCallback(async () => {
    generation.current += 1;
    const mine = generation.current;
    setState({ status: 'loading' });
    await load(mine, (client) => client.me());
  }, [load]);

  const value = useMemo<SessionValue>(
    () => ({ ...state, signIn, signOut, setUser, refresh, isWorking }),
    [state, signIn, signOut, setUser, refresh, isWorking],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * A build misconfiguration, not a member-facing failure: raw English developer text, never
 * localised, the same call the admin console makes. It only ever renders in a production build
 * whose `VITE_FIREBASE_*` variables were not set — a dev server without them falls back to the
 * mock instead (`resolveServices`), and a preview sets `VITE_MOCK=1`.
 */
function ConfigurationError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-6 text-center">
      <h1 className="type-h3 text-foreground">Configuration error</h1>
      <p className="type-caption text-foreground-secondary">
        This build is missing its VITE_FIREBASE_* environment variables, so it cannot sign anyone
        in. Set them in the Pages project and redeploy.
      </p>
    </main>
  );
}

/** Wraps `SessionProvider` with the one check that has to happen before Firebase is touched. */
export function SessionGateProvider({ children, auth }: { children: ReactNode; auth?: AuthPort }) {
  if (!auth && isFirebaseMisconfigured()) return <ConfigurationError />;
  return <SessionProvider auth={auth}>{children}</SessionProvider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
