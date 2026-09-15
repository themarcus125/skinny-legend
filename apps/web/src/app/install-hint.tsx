import { useCallback, useState } from 'react';
import { useTranslations } from 'use-intl';
import { AlertBanner } from '@skinny/ui';
import { needsHomeScreenInstall } from '@/push/ports';

/** Where the dismissal lives; a member who has waved this away never sees it again. */
export const INSTALL_HINT_DISMISSED_KEY = 'skinny.installHint.dismissed';

export interface InstallHintInputs {
  /** An iOS/iPadOS browser — the only place "Add to Home Screen" is the wording and the fix. */
  isIosSafari: boolean;
  /** Already launched from the Home Screen, so there is nothing left to install. */
  isStandalone: boolean;
  dismissed: boolean;
}

/**
 * The whole decision, as a pure function of the three inputs — the environment reads live in the
 * component, so this stays testable without stubbing a user agent.
 */
export function shouldShowInstallHint({
  isIosSafari,
  isStandalone,
  dismissed,
}: InstallHintInputs): boolean {
  return isIosSafari && !isStandalone && !dismissed;
}

/** `localStorage` throws outright in a locked-down webview; a hint is not worth a white screen. */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1');
  } catch {
    /* the in-memory state below still hides it for this session */
  }
}

/**
 * The one-time "Add to Home Screen" card. Apple only hands web push to an installed PWA, so on
 * iOS Safari this is the difference between a member who can be reminded and one who cannot —
 * which is why it is shell chrome and not a line buried in Account (the Account reminders row
 * shows the same `pwa.installBody` copy when it is asked directly, `reminders-row.tsx`).
 *
 * `needsHomeScreenInstall()` already answers "iOS and not standalone" for the push code; reusing
 * it keeps one definition of that check in the app.
 */
export function InstallHint() {
  const t = useTranslations();
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
  }, []);

  const visible = shouldShowInstallHint({
    isIosSafari: needsHomeScreenInstall(),
    // `needsHomeScreenInstall()` already excludes standalone, so the flag here is only about
    // keeping the pure function's contract honest for its own callers and tests.
    isStandalone: false,
    dismissed,
  });
  if (!visible) return null;

  return (
    <div data-testid="install-hint" className="px-4 pt-3">
      <AlertBanner
        tone="info"
        title={t('pwa.installTitle')}
        description={t('pwa.installBody')}
        action={
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 rounded-md px-2 type-caption font-semibold underline underline-offset-2"
          >
            {t('pwa.installDismiss')}
          </button>
        }
      />
    </div>
  );
}
