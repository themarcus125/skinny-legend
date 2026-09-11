'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QueryState } from '@/components/query-state';
import { RulesForm } from '@/components/rules/rules-form';
import { describeError } from '@/lib/api';
import type { RulesPayload } from '@/lib/api/types';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function RulesPage() {
  const api = useAdminApi();
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({ queryKey: ['admin', 'rules'], queryFn: () => api.getRules() });

  const saveRules = useMutation({
    mutationFn: (payload: RulesPayload) => api.putRules(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'rules'] });
      toast.success('Đã lưu luật chơi');
    },
    onError: (error: Error) => toast.error(describeError(error)),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Luật chơi</h1>
        <p className="text-sm text-muted-foreground">
          Sửa điểm, giới hạn và mốc thời gian của thử thách đang chạy.
        </p>
      </header>

      <QueryState
        isPending={rulesQuery.isPending}
        error={rulesQuery.error}
        isEmpty={false}
        emptyLabel="Chưa có thử thách nào."
      >
        {rulesQuery.data ? (
          <RulesForm
            // Remount when the server data changes so the form resets to the saved values.
            key={`${rulesQuery.data.challenge.startDate}-${rulesQuery.data.rules.length}-${rulesQuery.dataUpdatedAt}`}
            data={rulesQuery.data}
            isSaving={saveRules.isPending}
            onSave={(payload) => saveRules.mutate(payload)}
          />
        ) : null}
      </QueryState>
    </div>
  );
}
