import { useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import type { UserDto } from '@skinny/api-client';
import { AlertBanner, Avatar, SurfaceCard, cn } from '@skinny/ui';
import { ChevronRightGlyph } from '@/app/icons';
import { LargeTitle } from '@/app/large-title';
import { useSession } from '@/auth/session';
import { APP_VERSION, MOMO_FUND_URL, readMockOverride, writeMockOverride } from '@/lib/app-mode';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';
import { ConfirmDialog } from './confirm-dialog';
import { FeedbackSheet } from './feedback-sheet';
import { LanguagePicker } from './language-picker';
import { ProfileEditSheet } from './profile-edit';
import { RemindersRow } from './reminders-row';
import { SettingRow } from './settings-row';
import { ThemePicker } from './theme-picker';

export { MOMO_FUND_URL };

/** Avatar diameter on the header card — `AccountView`'s 56. */
const HEADER_AVATAR = 56;

/**
 * "Tài khoản" — port of `ios/SkinnyLegend/Features/Account/AccountView.swift`: a profile header
 * that opens the edit sheet and one settings card (language, appearance, reminders, the group
 * fund, feedback, sign-out, version). My activity history moved to Ghi nhận (`history.tsx`).
 *
 * Two deliberate differences from the iOS list:
 *
 * - **Giao diện** is web-only. iOS follows the system appearance; a browser tab wants an override
 *   (see `theme-picker.tsx`).
 * - **Nhắc nhở** carries one state iOS cannot: `unsupported`. A browser that cannot take web push
 *   at all gets the switch disabled with an explanation instead of iOS's "Mở Cài đặt", which has
 *   no web equivalent (see `reminders-row.tsx`).
 *
 * `/me` knows the avatar as a storage key, not a URL, so the header's face (and the rank and
 * total beside the name) come from this member's own leaderboard row, exactly as `AccountModel`
 * does — and coming in from the board that query is already warm.
 */
export function Account() {
  const t = useTranslations();
  const api = useApi();
  const session = useSession();
  const user: UserDto | null =
    session.status === 'active' || session.status === 'pending' ? session.user : null;

  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isFeedbackOpen, setFeedbackOpen] = useState(false);
  const [isSignOutOpen, setSignOutOpen] = useState(false);
  const [didSendFeedback, setDidSendFeedback] = useState(false);

  const board = useQuery({ queryKey: queryKeys.leaderboard, queryFn: () => api.leaderboard() });
  const row = board.data?.find((entry) => entry.isMe);
  const name = user?.displayName ?? row?.user.displayName ?? '';
  // Dev builds only, and only while the override is actually on: the production read is compiled
  // out (`readMockOverride` is gated on `import.meta.env.DEV`), so this can never strand a member.
  const canLeaveMock = import.meta.env.DEV && readMockOverride();

  return (
    <>
      <LargeTitle title={t('account.title')} />
      <div className="flex flex-col gap-3.5 px-4 pt-2 pb-8">
        <SurfaceCard as="section" padding="none" className="overflow-hidden">
          <button
            type="button"
            data-testid="account-header"
            onClick={() => setProfileOpen(true)}
            aria-label={t('account.profileOf', { 0: name })}
            className="flex w-full items-center gap-3.5 p-[18px] text-left"
          >
            <Avatar name={name} src={row?.user.avatarUrl} size={HEADER_AVATAR} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span data-testid="account-name" className="type-h2 truncate font-heading">
                {name}
              </span>
              {row ? (
                <span data-testid="account-summary" className="type-caption text-foreground-secondary">
                  {t('account.rankPoints', { 0: row.rank, 1: row.total })}
                </span>
              ) : (
                <span className="type-caption text-foreground-secondary">
                  {t('account.editProfile')}
                </span>
              )}
            </span>
            <ChevronRightGlyph className="text-foreground-subtle size-3.5 shrink-0" />
          </button>
        </SurfaceCard>

        {board.error ? (
          <AlertBanner
            tone="destructive"
            title={t('account.profileLoadFailed')}
            description={t(describeError(board.error))}
            action={
              <Button size="sm" variant="secondary" onClick={() => void board.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}

        {/* `AlertBanner`'s success tone is already `role="status"` — polite, which is right for
            a confirmation of something the reader just did. */}
        {didSendFeedback ? <AlertBanner tone="success" title={t('account.feedbackSent')} /> : null}

        <SurfaceCard as="section" padding="none" className="overflow-hidden">
          <LanguagePicker />
          <ThemePicker />
          <RemindersRow />
          <ActionRow
            label={t('account.fund')}
            hint={t('account.fundLink')}
            href={MOMO_FUND_URL}
            testId="fund-row"
          />
          <ActionRow
            label={t('account.feedback')}
            onClick={() => setFeedbackOpen(true)}
            testId="feedback-row"
          />
          <ActionRow
            label={t('common.signOut')}
            destructive
            onClick={() => setSignOutOpen(true)}
            testId="sign-out-row"
          />
          {canLeaveMock ? (
            <ActionRow
              label={t('account.leaveSampleData')}
              testId="leave-mock-row"
              onClick={() => {
                writeMockOverride(false);
                window.location.reload();
              }}
            />
          ) : null}
          <SettingRow
            label={t('account.version')}
            control={
              <span data-testid="app-version" className="type-caption text-foreground-secondary tabular-nums">
                {APP_VERSION}
              </span>
            }
          />
        </SurfaceCard>
      </div>

      {isProfileOpen && user ? (
        <ProfileEditSheet
          user={user}
          avatarUrl={row?.user.avatarUrl}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}

      {isFeedbackOpen ? (
        <FeedbackSheet
          onClose={() => setFeedbackOpen(false)}
          onSent={() => {
            setFeedbackOpen(false);
            setDidSendFeedback(true);
          }}
        />
      ) : null}

      {isSignOutOpen ? (
        <ConfirmDialog
          title={t('auth.signOutConfirm')}
          confirmLabel={t('common.signOut')}
          busy={session.isWorking}
          onCancel={() => setSignOutOpen(false)}
          onConfirm={() => {
            void session.signOut();
          }}
        />
      ) : null}
    </>
  );
}

/** React Router 7's lazy-route convention. */
export const Component = Account;

/**
 * A settings row that does something: the group fund opens in a new tab, everything else is a
 * button. The hint sits outside the control and is wired with `aria-describedby`, so the
 * control's accessible name stays the label alone.
 */
function ActionRow({
  label,
  hint,
  href,
  onClick,
  destructive = false,
  testId,
}: {
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  testId: string;
}) {
  const hintId = useId();
  const inner: ReactNode = (
    <>
      <span className={cn('type-body-medium', destructive ? 'text-destructive' : 'text-foreground')}>
        {label}
      </span>
      <ChevronRightGlyph className="text-foreground-subtle size-3.5 shrink-0" />
    </>
  );
  const rowClass = 'border-border flex min-h-11 w-full items-center justify-between gap-3 border-t px-4 py-3';
  return (
    <div data-testid={testId}>
      {href ? (
        <a
          href={href}
          target="_blank"
          // `noreferrer` implies `noopener`; both are spelled out because the pair is the habit
          // that survives a later edit dropping one of them.
          rel="noreferrer noopener"
          aria-describedby={hint ? hintId : undefined}
          className={rowClass}
        >
          {inner}
        </a>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-describedby={hint ? hintId : undefined}
          className={rowClass}
        >
          {inner}
        </button>
      )}
      {hint ? (
        <p id={hintId} className="type-caption text-foreground-secondary -mt-1 px-4 pb-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
