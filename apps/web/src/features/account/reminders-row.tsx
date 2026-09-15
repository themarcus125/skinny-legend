import { useId } from 'react';
import { useTranslations } from 'use-intl';
import { AlertBanner, cn } from '@skinny/ui';
import { needsHomeScreenInstall } from '@/push/ports';
import type { PushRegistrar } from '@/push/registrar';
import { usePush } from '@/push/use-push';
import { SettingRow } from './settings-row';

/**
 * "Nhắc nhở" — the reminders toggle, port of the `Toggle` in
 * `ios/SkinnyLegend/Features/Account/AccountView.swift`.
 *
 * Four states, three of which iOS also has:
 *
 * - **off / on** — the switch drives `PushRegistrar.enable()` / `disable()`.
 * - **denied** — the switch is disabled with an explanation. iOS pairs that with "Mở Cài đặt",
 *   and the web has no equivalent: no browser exposes an API that opens its own site settings,
 *   and a notification permission, once denied, cannot even be re-prompted for. So the row
 *   explains where to go instead of offering a button that cannot work.
 * - **unsupported** — web-only. The switch is disabled and the row says so; on an iOS Safari
 *   that has not been installed to the Home Screen it also shows *how* to fix it, because there
 *   Apple gates web push on the installed app rather than on the browser.
 */
export function RemindersRow({ registrar }: { registrar?: PushRegistrar }) {
  const t = useTranslations();
  const { state, setEnabled } = usePush(registrar);
  const id = useId();

  const isDenied = state.permission === 'denied';
  const isUnsupported = state.permission === 'unsupported';
  const isBlocked = isDenied || isUnsupported;
  const showInstallHint = isUnsupported && needsHomeScreenInstall();

  return (
    <div data-testid="reminders-row">
      <SettingRow
        label={t('account.reminders')}
        hint={t('account.remindersHint')}
        labelFor={id}
        control={
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={state.isEnabled}
            disabled={isBlocked || state.isBusy}
            data-testid="reminders-switch"
            onClick={() => void setEnabled(!state.isEnabled)}
            className={cn(
              'outline-ring relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150',
              'disabled:opacity-40',
              state.isEnabled ? 'bg-primary' : 'bg-surface-2 border-border border',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all duration-150',
                state.isEnabled ? 'left-6' : 'left-1',
              )}
            />
          </button>
        }
      />
      {/*
        * The switch is already ON — the intent is recorded — but no token has reached the server
        * yet (the push subscription is still being negotiated, or the service worker has not
        * activated). Without this the row would claim reminders are on while nothing could be
        * delivered. `usePush` retries in the background; this is the honest caption meanwhile.
        */}
      {state.isRegistrationPending && !isBlocked ? (
        <p
          role="status"
          data-testid="reminders-pending"
          className="type-caption text-foreground-secondary px-4 pb-3"
        >
          {t('push.pending')}
        </p>
      ) : null}
      {isBlocked || state.errorKey ? (
        <div className="px-4 pb-3">
          {state.errorKey ? (
            <AlertBanner tone="destructive" title={t(state.errorKey)} />
          ) : isDenied ? (
            <AlertBanner tone="info" title={t('push.deniedExplanation')} />
          ) : (
            <AlertBanner
              tone="info"
              title={t('push.unsupported')}
              description={showInstallHint ? t('pwa.installBody') : undefined}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
