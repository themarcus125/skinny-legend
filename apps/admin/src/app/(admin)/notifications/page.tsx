'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { NotificationLog } from '@/components/notifications/notification-log';
import { TestSendForm } from '@/components/notifications/test-send-form';
import { CountPill, PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { describeError } from '@/lib/api';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tRoot = useTranslations();
  const api = useAdminApi();
  const queryClient = useQueryClient();

  const logQuery = useQuery({ queryKey: ['admin', 'notifications'], queryFn: () => api.listNotifications() });
  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.listUsers() });

  const testSend = useMutation({
    mutationFn: (userId: string) => api.sendTestNotification(userId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
      // FCM prunes dead registrations as a side effect; tell the admin when that happened.
      const description = result.removedTokens > 0 ? t('toast.removed', { count: result.removedTokens }) : undefined;
      if (result.sent === 0) {
        toast.warning(t('toast.none', { tokens: result.tokens }), { description });
      } else {
        toast.success(t('toast.sent', { sent: result.sent, tokens: result.tokens }), { description });
      }
    },
    // `push_failed` forwards raw FCM text in its message; describeError only ever maps the code.
    onError: (error: Error) => toast.error(tRoot(describeError(error))),
  });

  const items = logQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={logQuery.data ? <CountPill>{t('count', { count: items.length })}</CountPill> : null}
      />

      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <TestSendForm
          users={usersQuery.data ?? []}
          onSend={(userId) => testSend.mutate(userId)}
          isSending={testSend.isPending}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <QueryState
          isPending={logQuery.isPending}
          error={logQuery.error}
          isEmpty={items.length === 0}
          emptyLabel={t('empty')}
        >
          <NotificationLog items={items} />
        </QueryState>
      </section>
    </div>
  );
}
