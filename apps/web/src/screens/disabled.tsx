import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { EmptyState, SurfaceCard } from '@skinny/ui';
import { LockGlyph } from '@/app/icons';
import { useSession } from '@/auth/session';
import { Button } from '@/ui/button';

/**
 * Port of `DisabledView` (`ios/SkinnyLegend/Features/Auth/DisabledView.swift`).
 *
 * There is deliberately no profile to greet with: `authenticate`
 * (apps/api/src/middleware/auth.ts) rejects every request with 403 `disabled` before any handler
 * can return a `UserDto`, so this screen only ever shows the reason and the way back to sign-in.
 */
export function Component() {
  const t = useTranslations();
  const session = useSession();

  const signOut = useCallback(() => {
    void session.signOut();
  }, [session]);

  return (
    <main data-testid="disabled-screen" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <SurfaceCard as="section" className="w-full">
        <EmptyState
          icon={<LockGlyph className="size-12 text-primary" />}
          title={t('auth.disabledTitle')}
          description={t('auth.disabledBody')}
          className="px-0 py-2"
        />
      </SurfaceCard>

      <Button size="lg" fullWidth onClick={signOut} disabled={session.isWorking}>
        {t('common.signOut')}
      </Button>
    </main>
  );
}

Component.displayName = 'DisabledScreen';
