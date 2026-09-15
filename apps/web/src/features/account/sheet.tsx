import { useId, useRef, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { CloseGlyph } from '@/app/icons';
import { useModalSheet } from '@/app/use-modal-sheet';

/**
 * The bottom-sheet chrome Account's two forms share — the same anatomy as Track's verdict sheet
 * (grabber, titled header with a close control, a scrolling body, a pinned footer), which is what
 * `NavigationStack` + `.presentationSizing(.form)` gives the iOS sheets for free.
 *
 * Modality — focus in, Escape and Tab trapped, the page behind locked, focus restored on
 * dismissal — is `useModalSheet` (src/app/use-modal-sheet.ts), never re-implemented here.
 */
export function SheetShell({
  title,
  onDismiss,
  footer,
  children,
  testId,
}: {
  title: string;
  onDismiss: () => void;
  footer: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  const t = useTranslations();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useModalSheet({ panelRef: panel, onDismiss });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        data-testid={`${testId}-backdrop`}
        aria-hidden="true"
        onClick={onDismiss}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          'relative flex max-h-[92svh] w-full max-w-[520px] flex-col',
          'bg-background rounded-t-xl shadow-popover outline-none',
        )}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span aria-hidden="true" className="bg-border-strong h-1 w-9 rounded-full" />
        </div>

        <header className="flex min-h-11 items-center gap-2 px-4">
          <h2 id={titleId} className="type-h3 min-w-0 flex-1 truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('common.cancel')}
            className="text-foreground-secondary grid size-11 shrink-0 place-items-center rounded-full"
          >
            <CloseGlyph className="size-4" />
          </button>
        </header>

        <div
          data-scroll-container
          className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-2 pb-4"
        >
          {children}
        </div>

        <div className="border-border border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      </div>
    </div>
  );
}
