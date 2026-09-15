import { useId, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { useModalSheet } from '@/app/use-modal-sheet';
import { Button } from '@/ui/button';

/**
 * The confirmation in front of an irreversible action — iOS's `confirmationDialog`. It reuses
 * `useModalSheet` for the four things that make it modal, and is centred rather than a bottom
 * sheet because it is a question, not a form.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useModalSheet({ panelRef: panel, onDismiss: onCancel });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div aria-hidden="true" onClick={onCancel} className="absolute inset-0 bg-black/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="confirm-dialog"
        className="bg-background shadow-popover relative flex w-full max-w-[360px] flex-col gap-4 rounded-xl p-5 outline-none"
      >
        <h2 id={titleId} className="type-h3">
          {title}
        </h2>
        <div className="flex flex-col gap-2">
          <Button variant="destructive" fullWidth disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" fullWidth onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
