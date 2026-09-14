'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { describeError } from '@/lib/api';
import { useAdminApi, useAuth } from '@/lib/auth/auth-context';
import { challengeProgress, todayLocalDate } from '@/lib/challenge-progress';
import { formatDateTime, formatLocalDate } from '@/lib/format';
import { USER_STATUS_LABELS } from '@/lib/labels';

/** Fallback span while the rules query is in flight or failed. */
const DEFAULT_START = '2026-09-08';
const DEFAULT_END = '2026-12-25';

const LINK_CLASS =
  'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring text-sm font-semibold text-foreground underline decoration-foreground-subtle underline-offset-4 hover:decoration-foreground';

function KpiTile({
  label,
  value,
  sub,
  attention = false,
  error,
  isPending,
  children,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  attention?: boolean;
  error: Error | null;
  isPending: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-card">
      <p className="type-label flex items-center gap-1.5 text-muted-foreground">
        {label}
        {attention ? <span aria-hidden className="size-1.5 rounded-full bg-warning" /> : null}
      </p>
      <p data-slot="kpi-value" className="type-h1 mt-3 text-foreground">
        {isPending ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
        ) : error ? (
          '—'
        ) : (
          value
        )}
      </p>
      <p className={error ? 'mt-2 text-label text-destructive' : 'mt-2 text-label text-muted-foreground'}>
        {isPending ? (
          <span className="inline-block h-[18px] w-24 animate-pulse rounded bg-surface-2 align-top motion-reduce:animate-none" />
        ) : error ? (
          t(describeError(error))
        ) : (
          sub
        )}
      </p>
      {children}
    </div>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-secondary-foreground"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function OverviewPage() {
  const t = useTranslations('overview');
  const tRoot = useTranslations();
  const api = useAdminApi();
  const { user } = useAuth();

  // Same keys as the section pages so React Query dedupes the requests.
  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.listUsers() });
  const entriesQuery = useQuery({ queryKey: ['admin', 'entries', {}], queryFn: () => api.listEntries({}) });
  const rulesQuery = useQuery({ queryKey: ['admin', 'rules'], queryFn: () => api.getRules() });
  const feedbackQuery = useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api.listFeedback() });

  const users = usersQuery.data ?? [];
  const entries = entriesQuery.data ?? [];
  const rules = rulesQuery.data;
  const feedback = feedbackQuery.data ?? [];

  const activeUsers = users.filter((u) => u.status === 'active').length;
  const pendingUsers = users.filter((u) => u.status === 'pending');
  const disabledUsers = users.filter((u) => u.status === 'disabled').length;

  const pendingEntries = entries.filter((e) => e.status === 'pending').length;
  const today = todayLocalDate();
  const todayEntries = entries.filter((e) => e.localDate === today);
  const confirmedToday = todayEntries.filter((e) => e.status === 'confirmed').length;

  const start = rules?.challenge.startDate ?? DEFAULT_START;
  const end = rules?.challenge.endDate ?? DEFAULT_END;
  const progress = challengeProgress(start, end);
  const progressSub =
    progress.phase === 'before'
      ? t('startsOn', { date: formatLocalDate(start) })
      : progress.phase === 'during'
        ? t('daysLeft', { days: progress.remaining })
        : t('endedOn', { date: formatLocalDate(end) });

  const todoIsEmpty = !usersQuery.isPending && !entriesQuery.isPending && pendingUsers.length === 0 && pendingEntries === 0;

  return (
    <div>
      <PageHeader
        title={t('greeting', { name: user?.displayName ?? '' })}
        description={
          rules ? `${rules.challenge.name} · ${formatLocalDate(start)} – ${formatLocalDate(end)}` : t('subtitle')
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label={t('activeMembers')}
            value={activeUsers}
            sub={t('activeMembersSub', { pending: pendingUsers.length, disabled: disabledUsers })}
            attention={pendingUsers.length > 0}
            error={usersQuery.error}
            isPending={usersQuery.isPending}
          />
          <KpiTile
            label={t('pendingEntries')}
            value={pendingEntries}
            sub={t('pendingEntriesSub')}
            attention={pendingEntries > 0}
            error={entriesQuery.error}
            isPending={entriesQuery.isPending}
          />
          <KpiTile
            label={t('entriesToday')}
            value={todayEntries.length}
            sub={t('entriesTodaySub', { confirmed: confirmedToday })}
            error={entriesQuery.error}
            isPending={entriesQuery.isPending}
          />
          <KpiTile
            label={t('challengeDays')}
            value={t('dayOfTotal', { day: progress.day, total: progress.total })}
            sub={progressSub}
            error={rulesQuery.error}
            isPending={rulesQuery.isPending}
          >
            {rules ? (
              <div
                role="progressbar"
                aria-label={t('progress')}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.day}
                className="mt-4 h-2 w-full overflow-hidden rounded-full bg-track"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(progress.day / progress.total) * 100}%` }}
                />
              </div>
            ) : null}
          </KpiTile>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="type-h2">{t('todo')}</CardTitle>
              <CardDescription>{t('todoHint')}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <QueryState
                isPending={usersQuery.isPending || entriesQuery.isPending}
                error={usersQuery.error ?? entriesQuery.error}
                isEmpty={todoIsEmpty}
                emptyLabel={t('todoEmpty')}
              >
                <ul className="divide-y divide-border">
                  {pendingUsers.map((pending) => (
                    <li key={pending.id} className="flex items-center gap-3 px-5 py-3">
                      <Initial name={pending.displayName} />
                      <span className="min-w-0 truncate text-base font-semibold">{pending.displayName}</span>
                      <Badge variant="warning">{tRoot(USER_STATUS_LABELS.pending)}</Badge>
                      <Link href="/members" className={`ml-auto ${LINK_CLASS}`}>
                        {tRoot('members.approve')}
                      </Link>
                    </li>
                  ))}
                  {pendingEntries > 0 ? (
                    <li className="flex items-center gap-3 px-5 py-3">
                      <span className="text-base font-semibold">{t('pendingEntriesTodo', { count: pendingEntries })}</span>
                      <Link href="/entries" className={`ml-auto ${LINK_CLASS}`}>
                        {tRoot('common.view')}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </QueryState>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="type-h2">{t('latestFeedback')}</CardTitle>
              <CardDescription>{t('latestFeedbackHint')}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <QueryState
                isPending={feedbackQuery.isPending}
                error={feedbackQuery.error}
                isEmpty={feedback.length === 0}
                emptyLabel={tRoot('feedback.empty')}
              >
                <ul className="divide-y divide-border">
                  {feedback.slice(0, 3).map((item) => (
                    <li key={item.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base font-semibold">{item.user.displayName}</span>
                        <span className="type-label shrink-0 tabular-nums text-foreground-secondary">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm text-foreground-secondary">{item.message}</p>
                    </li>
                  ))}
                </ul>
              </QueryState>
            </CardContent>
            <CardFooter>
              <Link href="/feedback" className={LINK_CLASS}>
                {t('viewAllFeedback')}
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
