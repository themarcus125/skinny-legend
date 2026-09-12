'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MembersTable } from '@/components/members/members-table';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { describeError } from '@/lib/api';
import type { UserPatch } from '@/lib/api/types';
import { useAdminApi, useAuth } from '@/lib/auth/auth-context';

export default function MembersPage() {
  const t = useTranslations('members');
  const tRoot = useTranslations();
  const api = useAdminApi();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.listUsers() });

  const patchUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UserPatch }) => api.patchUser(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(t('updated'));
    },
    onError: (error: Error) => toast.error(tRoot(describeError(error))),
  });

  const users = usersQuery.data ?? [];
  const pendingCount = users.filter((user) => user.status === 'pending').length;

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={pendingCount > 0 ? t('pendingCount', { count: pendingCount }) : t('noPending')}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <QueryState
          isPending={usersQuery.isPending}
          error={usersQuery.error}
          isEmpty={users.length === 0}
          emptyLabel={t('empty')}
        >
          <MembersTable
            users={users}
            isPatching={patchUser.isPending}
            onPatch={(id, patch) => patchUser.mutate({ id, patch })}
            currentUserId={currentUser?.id}
          />
        </QueryState>
      </section>
    </div>
  );
}
