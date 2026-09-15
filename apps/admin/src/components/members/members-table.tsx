'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { ROLE_LABELS, USER_STATUS_LABELS, translateLabels } from '@/lib/labels';
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
  const t = useTranslations();
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const roleItems = translateLabels(ROLE_LABELS, t);

  function run(user: AdminUser, action: MemberAction) {
    if (action.confirm) {
      setConfirming({ user, action });
      return;
    }
    onPatch(user.id, action.patch);
  }

  return (
    <>
      <Table containerClassName="md:max-h-[calc(100dvh-15rem)]">
        <TableHeader>
          <TableRow>
            <TableHead>{t('common.name')}</TableHead>
            <TableHead>{t('common.status')}</TableHead>
            <TableHead>{t('members.role')}</TableHead>
            <TableHead className="text-right">{t('members.joined')}</TableHead>
            <TableHead className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = currentUserId != null && user.id === currentUserId;
            // Self-lockout guard: never let the signed-in admin disable or demote themselves.
            // Approve/reactivate stay available — those can't strand the account.
            const actions = availableActions(user).filter((action) => !(isSelf && action.key === 'disable'));
            return (
              <TableRow key={user.id} data-testid="member-row" data-user-id={user.id}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-secondary-foreground"
                    >
                      {user.displayName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-base font-semibold text-foreground">{user.displayName}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge data-testid="member-status" variant={STATUS_TONE[statusVariant(user.status)]}>
                    {t(USER_STATUS_LABELS[user.status])}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select
                    items={roleItems}
                    value={user.role}
                    disabled={isPatching || isSelf}
                    onValueChange={(role) => onPatch(user.id, { role: role as Role })}
                  >
                    <SelectTrigger
                      data-testid="member-role"
                      size="sm"
                      className="w-40"
                      aria-label={t('members.roleOf', { name: user.displayName })}
                      title={isSelf ? t('members.cannotChangeOwnRole') : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleItems[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-foreground-secondary">
                  {formatDateTime(user.createdAt)}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {actions.map((action) => (
                    <Button
                      key={action.key}
                      data-testid={`member-action-${action.key}`}
                      size="sm"
                      variant={action.confirm ? 'outline' : 'default'}
                      className={
                        action.confirm ? 'text-destructive hover:border-destructive hover:bg-destructive-soft' : undefined
                      }
                      disabled={isPatching}
                      onClick={() => run(user, action)}
                    >
                      {t(action.label)}
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
            <DialogTitle>{t('members.lockConfirm')}</DialogTitle>
            <DialogDescription>
              {confirming ? t('members.lockDescription', { name: confirming.user.displayName }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isPatching}
              onClick={() => {
                if (confirming) onPatch(confirming.user.id, confirming.action.patch);
                setConfirming(null);
              }}
            >
              {t('members.lock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
