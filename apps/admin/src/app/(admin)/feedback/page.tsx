'use client';

import { useQuery } from '@tanstack/react-query';
import { FeedbackList } from '@/components/feedback/feedback-list';
import { CountPill, PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function FeedbackPage() {
  const api = useAdminApi();
  const feedbackQuery = useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api.listFeedback() });
  const items = feedbackQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Góp ý"
        description="Góp ý gửi từ ứng dụng iOS, mới nhất trước. Chỉ xem, không sửa được."
        action={feedbackQuery.data ? <CountPill>{items.length} góp ý</CountPill> : null}
      />

      <QueryState
        isPending={feedbackQuery.isPending}
        error={feedbackQuery.error}
        isEmpty={items.length === 0}
        emptyLabel="Chưa có góp ý nào."
      >
        <FeedbackList items={items} />
      </QueryState>
    </div>
  );
}
