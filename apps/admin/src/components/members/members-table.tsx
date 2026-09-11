'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLES, type AdminUser, type Role, type UserPatch } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS, USER_STATUS_LABELS } from '@/lib/labels';
import { availableActions, statusVariant, type MemberAction } from './member-actions';

/** statusVariant() is pinned by its own tests; the soft pill tone is mapped here instead. */
const STATUS_TONE: Record<ReturnType<typeof statusVariant>, 'success' | 'warning' | 'destructive'> = {
  default: 'success',
  secondary: 'warning',
  destructive: 'destructive',
};

interface PendingConfirm {
  user: AdminUser;
  action: MemberAction;
}

export function MembersTable({
  users,
  onPatch,
  isPatching,
  currentUserId,
}: {
  users: AdminUser[];
  onPatch: (id: string, patch: UserPatch) => void;
  isPatching: boolean;
  /** The signed-in admin's id. Their own row can't disable or demote itself (no self-lockout). */
  currentUserId?: string | null;
}) {
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);

  function run(user: AdminUser, action: MemberAction) {
    if (action.confirm) {
      setConfirming({ user, action });
      return;
    }
    onPatch(user.id, action.patch);
  }

  return (
    <>
      <Table containerClassName="max-h-[calc(100dvh-15rem)]">
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead>Tham gia</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = currentUserId != null && user.id === currentUserId;
            // Self-lockout guard: never let the signed-in admin disable or demote themselves.
            // Approve/reactivate stay available — those can't strand the account.
            const actions = availableActions(user).filter((action) => !(isSelf && action.key === 'disable'));
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium text-foreground">
                  <span
                    aria-hidden
                    className="mr-2.5 inline-flex size-7 items-center justify-center rounded-full bg-secondary align-middle text-xs font-semibold text-secondary-foreground"
                  >
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                  {user.displayName}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_TONE[statusVariant(user.status)]}>{USER_STATUS_LABELS[user.status]}</Badge>
                </TableCell>
                <TableCell>
                  <Select
                    items={ROLE_LABELS}
                    value={user.role}
                    disabled={isPatching || isSelf}
                    onValueChange={(role) => onPatch(user.id, { role: role as Role })}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-40"
                      aria-label={`Vai trò của ${user.displayName}`}
                      title={isSelf ? 'Không thể đổi vai trò của chính bạn' : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm tabular-nums text-foreground-secondary">
                  {formatDateTime(user.createdAt)}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {actions.map((action) => (
                    <Button
                      key={action.key}
                      size="sm"
                      variant={action.confirm ? 'outline' : 'default'}
                      className={
                        action.confirm ? 'text-destructive hover:border-destructive/30 hover:bg-danger-soft' : undefined
                      }
                      disabled={isPatching}
                      onClick={() => run(user, action)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Khoá tài khoản?</DialogTitle>
            <DialogDescription>
              {confirming
                ? `${confirming.user.displayName} sẽ không đăng nhập được nữa (API trả 403 disabled). Các mục đã ghi vẫn được giữ và vẫn tính điểm.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={isPatching}
              onClick={() => {
                if (confirming) onPatch(confirming.user.id, confirming.action.patch);
                setConfirming(null);
              }}
            >
              Khoá tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
