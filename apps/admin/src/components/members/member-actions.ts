import type { AdminUser, UserPatch, UserStatus } from '@/lib/api/types';

export interface MemberAction {
  key: 'approve' | 'disable' | 'reactivate';
  /** Message key under `members.*`; the table renders `t(label)`. */
  label: string;
  patch: UserPatch;
  /** Destructive actions go through a confirmation dialog. */
  confirm: boolean;
}

/** The status transitions the API allows from each state (PATCH /admin/users/:id). */
export function availableActions(user: AdminUser): MemberAction[] {
  switch (user.status) {
    case 'pending':
      return [{ key: 'approve', label: 'members.approve', patch: { status: 'active' }, confirm: false }];
    case 'active':
      return [{ key: 'disable', label: 'members.lock', patch: { status: 'disabled' }, confirm: true }];
    case 'disabled':
      return [{ key: 'reactivate', label: 'members.reopen', patch: { status: 'active' }, confirm: false }];
  }
}

export function statusVariant(status: UserStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'active') return 'default';
  if (status === 'pending') return 'secondary';
  return 'destructive';
}
