import { useCallback } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useTranslations } from 'use-intl';
import { EmptyState } from '@skinny/ui';
import { useSession } from '@/auth/session';
import { Button } from '@/ui/button';

/** The three routes that exist *because* of a session state, not because a member navigated. */
export const SIGN_IN_ROUTE = '/sign-in';
export const PENDING_ROUTE = '/pending';
export const DISABLED_ROUTE = '/disabled';
const GATE_ROUTES = new Set<string>([SIGN_IN_ROUTE, PENDING_ROUTE, DISABLED_ROUTE]);

/** Where each session state belongs. `active` is the only one that reaches the app itself. */
function routeFor(status: string): string | null {
  switch (status) {
    case 'signedOut':
      return SIGN_IN_ROUTE;
    case 'pending':
      return PENDING_ROUTE;
    case 'disabled':
      return DISABLED_ROUTE;
    default:
      return null;
  }
}

/**
 * The pathless layout route every other route sits under: it turns `SessionState` into a
 * redirect, which is how `AppEnvironment`'s `switch` over the session becomes routing on the web.
 *
 * `active` members reaching a gate route are sent home, so the back button after signing in does
 * not land on the sign-in screen again.
 */
export function SessionGate() {
  const session = useSession();
  const { pathname } = useLocation();
  const t = useTranslations();

  const retry = useCallback(() => {
    void session.refresh();
  }, [session]);

  if (session.status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="type-body text-foreground-secondary">{t('common.loading')}</p>
      </main>
    );
  }

  if (session.status === 'error') {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <EmptyState
          title={t(session.messageKey)}
          action={
            <Button onClick={retry} disabled={session.isWorking}>
              {t('common.retry')}
            </Button>
          }
        />
      </main>
    );
  }

  const target = routeFor(session.status);
  if (target) return pathname === target ? <Outlet /> : <Navigate to={target} replace />;
  return GATE_ROUTES.has(pathname) ? <Navigate to="/" replace /> : <Outlet />;
}
