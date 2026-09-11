'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
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

/** Fallback span while the rules query is in flight or failed. */
const DEFAULT_START = '2026-09-08';
const DEFAULT_END = '2026-12-25';

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
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-card">
      <p className="flex items-center gap-1.5 text-label font-medium text-muted-foreground">
        {label}
        {attention ? <span aria-hidden className="size-1.5 rounded-full bg-brand" /> : null}
      </p>
      <p data-slot="kpi-value" className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-foreground">
        {isPending ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        ) : error ? (
          '—'
        ) : (
          value
        )}
      </p>
      <p className={error ? 'mt-1 text-label text-danger-fg' : 'mt-1 text-label text-muted-foreground'}>
        {error ? describeError(error) : isPending ? ' ' : sub}
      </p>
      {children}
    </div>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function OverviewPage() {
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
      ? `Bắt đầu ${formatLocalDate(start)}`
      : progress.phase === 'during'
        ? `còn ${progress.remaining} ngày`
        : `Đã kết thúc ${formatLocalDate(end)}`;

  const todoIsEmpty = !usersQuery.isPending && !entriesQuery.isPending && pendingUsers.length === 0 && pendingEntries === 0;

  return (
    <div>
      <PageHeader
        title={`Xin chào ${user?.displayName ?? ''}`}
        description={
          rules
            ? `${rules.challenge.name} · ${formatLocalDate(start)} – ${formatLocalDate(end)}`
            : 'Operation Skinny Legend — 08/09/2026 đến 25/12/2026.'
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Thành viên hoạt động"
            value={activeUsers}
            sub={`${pendingUsers.length} chờ duyệt · ${disabledUsers} đã khoá`}
            attention={pendingUsers.length > 0}
            error={usersQuery.error}
            isPending={usersQuery.isPending}
          />
          <KpiTile
            label="Mục ghi chờ xác nhận"
            value={pendingEntries}
            sub={`trong ${entries.length} mục gần nhất`}
            attention={pendingEntries > 0}
            error={entriesQuery.error}
            isPending={entriesQuery.isPending}
          />
          <KpiTile
            label="Mục ghi hôm nay"
            value={todayEntries.length}
            sub={`${confirmedToday} đã xác nhận`}
            error={entriesQuery.error}
            isPending={entriesQuery.isPending}
          />
          <KpiTile
            label="Ngày thử thách"
            value={`Ngày ${progress.day} / ${progress.total}`}
            sub={progressSub}
            error={rulesQuery.error}
            isPending={rulesQuery.isPending}
          >
            <div
              role="progressbar"
              aria-label="Tiến độ thử thách"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.day}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${(progress.day / progress.total) * 100}%` }}
              />
            </div>
          </KpiTile>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Cần xử lý</CardTitle>
              <CardDescription>Việc chờ quản trị viên.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <QueryState
                isPending={usersQuery.isPending || entriesQuery.isPending}
                error={usersQuery.error ?? entriesQuery.error}
                isEmpty={todoIsEmpty}
                emptyLabel="Không có việc nào chờ xử lý."
              >
                <ul className="divide-y divide-border">
                  {pendingUsers.map((pending) => (
                    <li key={pending.id} className="flex items-center gap-3 px-5 py-3">
                      <Initial name={pending.displayName} />
                      <span className="text-sm font-medium">{pending.displayName}</span>
                      <Badge variant="warning">Chờ duyệt</Badge>
                      <Link href="/members" className="ml-auto text-sm font-medium text-brand-fg hover:underline">
                        Duyệt
                      </Link>
                    </li>
                  ))}
                  {pendingEntries > 0 ? (
                    <li className="flex items-center gap-3 px-5 py-3">
                      <span className="text-sm font-medium">{pendingEntries} mục ghi chờ xác nhận</span>
                      <Link href="/entries" className="ml-auto text-sm font-medium text-brand-fg hover:underline">
                        Xem
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </QueryState>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Góp ý mới nhất</CardTitle>
              <CardDescription>Gần đây từ ứng dụng iOS.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <QueryState
                isPending={feedbackQuery.isPending}
                error={feedbackQuery.error}
                isEmpty={feedback.length === 0}
                emptyLabel="Chưa có góp ý nào."
              >
                <ul className="divide-y divide-border">
                  {feedback.slice(0, 3).map((item) => (
                    <li key={item.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{item.user.displayName}</span>
                        <span className="text-label tabular-nums text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-foreground-secondary">{item.message}</p>
                    </li>
                  ))}
                </ul>
              </QueryState>
            </CardContent>
            <CardFooter>
              <Link href="/feedback" className="text-sm font-medium text-brand-fg hover:underline">
                Xem tất cả góp ý
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
