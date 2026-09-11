'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MembersTable } from '@/components/members/members-table';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { describeError } from '@/lib/api';
import type { UserPatch } from '@/lib/api/types';
import { useAdminApi, useAuth } from '@/lib/auth/auth-context';

export default function MembersPage() {
  const api = useAdminApi();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.listUsers() });

  const patchUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UserPatch }) => api.patchUser(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Đã cập nhật thành viên');
    },
    onError: (error: Error) => toast.error(describeError(error)),
  });

  const users = usersQuery.data ?? [];
  const pendingCount = users.filter((user) => user.status === 'pending').length;

  return (
    <div>
      <PageHeader
        title="Thành viên"
        description={
          pendingCount > 0 ? `${pendingCount} tài khoản đang chờ duyệt.` : 'Không có tài khoản nào chờ duyệt.'
        }
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <QueryState
          isPending={usersQuery.isPending}
          error={usersQuery.error}
          isEmpty={users.length === 0}
          emptyLabel="Chưa có thành viên nào."
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
