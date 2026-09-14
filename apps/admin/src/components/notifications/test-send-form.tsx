'use client';

import { useState } from 'react';
import { SendIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { AdminUser } from '@/lib/api/types';

/**
 * A plain <select> rather than the shadcn Select: this control has exactly one job, and a native
 * select is keyboard- and screen-reader-correct with no extra dependency.
 */
export function TestSendForm({
  users,
  onSend,
  isSending,
}: {
  users: AdminUser[];
  onSend: (userId: string) => void;
  isSending: boolean;
}) {
  const t = useTranslations('notifications.form');
  const [userId, setUserId] = useState('');
  // Only an active member can have signed in on the app, registered a device and be worth testing against.
  const candidates = users.filter((user) => user.status === 'active');

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="test-send-user">{t('member')}</Label>
        <select
          id="test-send-user"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-11 rounded-md border border-input bg-card pr-2 pl-3 text-sm transition-colors outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{t('placeholder')}</option>
          {candidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" disabled={!userId || isSending} onClick={() => onSend(userId)}>
        <SendIcon aria-hidden className="size-4" />
        {isSending ? t('sending') : t('send')}
      </Button>
    </div>
  );
}
