import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';
import { AlertBanner } from '@skinny/ui';
import { APP_VERSION } from '@/lib/app-mode';
import { describeError, useApi } from '@/lib/api';
import { Button } from '@/ui/button';
import { SheetShell } from './sheet';

/** `POST /feedback` caps the message; the same bound as iOS's `FeedbackModel`. */
export const MAX_FEEDBACK_LENGTH = 2000;

/**
 * "Gửi góp ý" — port of `ios/SkinnyLegend/Features/Account/FeedbackSheet.swift`, message only.
 *
 * The iOS sheet also attaches an optional screenshot through a presigned PUT; the web leaves that
 * to a later pass (the API and `presign({ kind: 'feedback' })` already accept one) because a
 * browser cannot take its own screenshot, so the affordance would be a second file picker rather
 * than the one-tap share iOS offers. `appVersion` still rides along, which is the field the
 * console actually triages by.
 */
export function FeedbackSheet({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const t = useTranslations();
  const api = useApi();
  const fieldId = useId();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const trimmed = message.trim();
  const canSend = !isSending && trimmed !== '' && trimmed.length <= MAX_FEEDBACK_LENGTH;

  const send = () => {
    if (!canSend) return;
    setIsSending(true);
    setErrorKey(null);
    api
      .sendFeedback({ message: trimmed, appVersion: APP_VERSION })
      .then(() => {
        // The confirmation belongs to the screen, not to a sheet that is about to unmount.
        onSent();
      })
      .catch((error: unknown) => {
        setIsSending(false);
        setErrorKey(describeError(error));
      });
  };

  return (
    <SheetShell
      testId="feedback-sheet"
      title={t('account.feedback')}
      onDismiss={onClose}
      footer={
        <Button size="lg" fullWidth disabled={!canSend} onClick={send}>
          {isSending ? t('common.sending') : t('common.send')}
        </Button>
      }
    >
      <label htmlFor={fieldId} className="type-label text-foreground-subtle">
        {t('account.feedbackYours')}
      </label>
      <textarea
        id={fieldId}
        value={message}
        maxLength={MAX_FEEDBACK_LENGTH}
        onChange={(event) => setMessage(event.target.value)}
        rows={6}
        className="border-border bg-card text-foreground type-body-medium outline-ring min-h-[140px] rounded-md border px-3 py-2"
      />
      <p className="type-caption text-foreground-secondary">
        {t('account.versionNote', { 0: APP_VERSION })}
      </p>
      {errorKey ? (
        <AlertBanner
          tone="destructive"
          title={t('account.feedbackFailed')}
          description={t(errorKey)}
        />
      ) : null}
    </SheetShell>
  );
}
