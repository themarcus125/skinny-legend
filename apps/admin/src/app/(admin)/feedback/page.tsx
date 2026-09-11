'use client';

import { useQuery } from '@tanstack/react-query';
import { FeedbackList } from '@/components/feedback/feedback-list';
import { QueryState } from '@/components/query-state';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function FeedbackPage() {
  const api = useAdminApi();
  const feedbackQuery = useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api.listFeedback() });
  const items = feedbackQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Góp ý</h1>
        <p className="text-sm text-muted-foreground">
          Góp ý gửi từ ứng dụng iOS, mới nhất trước. Chỉ xem, không sửa được.
        </p>
      </header>

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
