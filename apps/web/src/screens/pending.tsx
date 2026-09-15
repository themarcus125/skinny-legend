import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { EmptyState, SurfaceCard } from '@skinny/ui';
import { HourglassGlyph } from '@/app/icons';
import { useSession } from '@/auth/session';
import { Button } from '@/ui/button';

/**
 * Port of `PendingApprovalView` (`ios/SkinnyLegend/Features/Auth/PendingApprovalView.swift`).
 * Spec §10: a pending member sees this and nothing else — no tab bar, no data.
 *
 * "Kiểm tra lại" re-reads `GET /me`, which is how an approval lands without a reload.
 */
export function Component() {
  const t = useTranslations();
  const session = useSession();

  const refresh = useCallback(() => {
    void session.refresh();
  }, [session]);
  const signOut = useCallback(() => {
    void session.signOut();
  }, [session]);

  return (
    <main data-testid="pending-screen" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <SurfaceCard as="section" className="w-full">
        <EmptyState
          icon={<HourglassGlyph className="size-12 text-primary" />}
          title={t('auth.pendingTitle')}
          description={t('auth.pendingBody')}
          className="px-0 py-2"
        />
      </SurfaceCard>

      <div className="flex w-full flex-col items-center gap-2">
        <Button onClick={refresh} disabled={session.isWorking}>
          {t('common.checkAgain')}
        </Button>
        <Button variant="ghost" onClick={signOut} disabled={session.isWorking}>
          {t('common.signOut')}
        </Button>
      </div>
    </main>
  );
}

Component.displayName = 'PendingScreen';
