'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { RulesForm } from '@/components/rules/rules-form';
import { describeError } from '@/lib/api';
import type { RulesPayload } from '@/lib/api/types';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function RulesPage() {
  const t = useTranslations('rules');
  const tRoot = useTranslations();
  const api = useAdminApi();
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({ queryKey: ['admin', 'rules'], queryFn: () => api.getRules() });

  const saveRules = useMutation({
    mutationFn: (payload: RulesPayload) => api.putRules(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'rules'] });
      toast.success(t('saved'));
    },
    onError: (error: Error) => toast.error(tRoot(describeError(error))),
  });

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <QueryState
        isPending={rulesQuery.isPending}
        error={rulesQuery.error}
        isEmpty={false}
        emptyLabel={t('empty')}
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
