'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FeedbackList } from '@/components/feedback/feedback-list';
import { CountPill, PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function FeedbackPage() {
  const t = useTranslations('feedback');
  const api = useAdminApi();
  const feedbackQuery = useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api.listFeedback() });
  const items = feedbackQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        action={feedbackQuery.data ? <CountPill>{t('count', { count: items.length })}</CountPill> : null}
      />

      <QueryState
        isPending={feedbackQuery.isPending}
        error={feedbackQuery.error}
        isEmpty={items.length === 0}
        emptyLabel={t('empty')}
      >
        <FeedbackList items={items} />
      </QueryState>
    </div>
  );
}
