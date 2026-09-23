import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import type { CommentDto } from '@skinny/shared/wire';
import { ENTRY_COMMENT_MAX } from '@skinny/shared/wire';
import { AlertBanner, Avatar, EmptyState, cn } from '@skinny/ui';
import { CloseGlyph, CommentGlyph } from '@/app/icons';
import { useModalSheet } from '@/app/use-modal-sheet';
import { describeError, useApi } from '@/lib/api';
import { formatLocalDay } from '@/lib/local-day';
import { queryKeys } from '@/lib/query';
import { relativeTimeKey } from '@/lib/relative-time';
import { Button } from '@/ui/button';

/**
 * Which action failed and why — one state rather than a flag per mutation, so a delete failing
 * after an earlier post failure still names the delete rather than the post.
 */
interface SheetFailure {
  titleKey: 'comments.postFailed' | 'comments.deleteFailed';
  messageKey: string;
}

export interface CommentSheetProps {
  entryId: string;
  onDismiss: () => void;
  /** The thread's size after a post or a delete, for the feed card's count. */
  onCountChange: (count: number) => void;
}

/**
 * One entry's comment thread as a bottom sheet (feed social spec §F): the list oldest first,
 * a pinned composer, and "Xoá" where the server says I may. Same modality as the verdict sheet.
 */
export function CommentSheet({ entryId, onDismiss, onCountChange }: CommentSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [failure, setFailure] = useState<SheetFailure | null>(null);
  useModalSheet({ panelRef: panel, onDismiss });

  const thread = useQuery({
    queryKey: queryKeys.comments(entryId),
    queryFn: () => api.comments(entryId),
  });
  const comments = thread.data?.comments ?? [];

  const post = useMutation({
    mutationFn: (body: string) => api.postComment(entryId, body),
    onMutate: () => setFailure(null),
    onSuccess: async (response) => {
      setDraft('');
      setFailure(null);
      onCountChange(response.commentCount);
      await queryClient.invalidateQueries({ queryKey: queryKeys.comments(entryId) });
    },
    onError: (error) =>
      setFailure({ titleKey: 'comments.postFailed', messageKey: describeError(error) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(id),
    onMutate: () => setFailure(null),
    onSuccess: async () => {
      setFailure(null);
      // `staleTime: 0` on purpose: the app's client caches a thread for 30s (`makeQueryClient`),
      // so a plain `fetchQuery` would hand back the list the deleted row is still in — and the
      // count reported here would be the old one.
      const fresh = await queryClient.fetchQuery({
        queryKey: queryKeys.comments(entryId),
        queryFn: () => api.comments(entryId),
        staleTime: 0,
      });
      onCountChange(fresh.comments.length);
    },
    onError: (error) =>
      setFailure({ titleKey: 'comments.deleteFailed', messageKey: describeError(error) }),
  });

  const canSend = draft.trim().length > 0 && !post.isPending;
  const now = new Date();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div aria-hidden="true" onClick={onDismiss} className="absolute inset-0 bg-black/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="comment-sheet"
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
            {t('comments.title')}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('common.close')}
            className="text-foreground-secondary grid size-11 shrink-0 place-items-center rounded-full"
          >
            <CloseGlyph className="size-4" />
          </button>
        </header>

        <div
          data-scroll-container
          data-testid="comment-list"
          className="flex min-h-[160px] flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-2 pb-3"
        >
          {thread.isPending ? (
            <div aria-busy="true" className="bg-surface-2 h-[120px] animate-pulse rounded-xl" />
          ) : null}
          {thread.error ? (
            <AlertBanner
              tone="destructive"
              title={t('comments.loadFailed')}
              description={t(describeError(thread.error))}
              action={
                <Button size="sm" variant="secondary" onClick={() => void thread.refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : null}
          {thread.isSuccess && comments.length === 0 ? (
            <div data-testid="comment-empty">
              <EmptyState icon={<CommentGlyph className="size-8" />} title={t('comments.empty')} />
            </div>
          ) : null}
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              now={now}
              locale={locale}
              onDelete={comment.canDelete ? () => remove.mutate(comment.id) : undefined}
              busy={remove.isPending}
            />
          ))}
          {/* `AlertBanner` owns its own test id, so the sheet's failure gets its own wrapper. */}
          {failure ? (
            <div data-testid="comment-error">
              <AlertBanner
                tone="destructive"
                title={t(failure.titleKey)}
                description={t(failure.messageKey)}
              />
            </div>
          ) : null}
        </div>

        {/*
         * A form, so the composer is one submit rather than a click handler: Enter inside the
         * textarea inserts a newline — a comment is prose — and only "Gửi" sends.
         */}
        <form
          className="border-border flex items-end gap-2 border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) post.mutate(draft.trim());
          }}
        >
          <textarea
            data-testid="comment-input"
            value={draft}
            maxLength={ENTRY_COMMENT_MAX}
            rows={1}
            placeholder={t('comments.placeholder')}
            aria-label={t('comments.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
            className="border-border bg-card text-foreground type-body-medium outline-ring placeholder:text-foreground-subtle max-h-[112px] min-h-11 flex-1 resize-none rounded-md border px-3 py-2"
          />
          <Button type="submit" size="md" data-testid="comment-send" disabled={!canSend}>
            {post.isPending ? t('common.sending') : t('comments.send')}
          </Button>
        </form>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  now,
  locale,
  onDelete,
  busy,
}: {
  comment: CommentDto;
  now: Date;
  locale: string;
  onDelete?: () => void;
  busy: boolean;
}) {
  const t = useTranslations();
  const relative = relativeTimeKey(comment.createdAt, now);
  const when = relative
    ? relative.key === 'time.now'
      ? t('time.now')
      : t(relative.key, { 0: relative.value })
    : formatLocalDay(comment.createdAt.slice(0, 10), locale);
  return (
    <div data-testid="comment-row" className="flex items-start gap-2.5">
      <Avatar name={comment.user.displayName} src={comment.user.avatarUrl} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-label">
          <span className="font-medium">{comment.user.displayName}</span>
          <span className="text-foreground-subtle"> · {when}</span>
        </p>
        <p className="type-body whitespace-pre-line">{comment.body}</p>
      </div>
      {onDelete ? (
        <Button
          size="sm"
          variant="ghost"
          data-testid="comment-delete"
          className="text-destructive"
          disabled={busy}
          onClick={onDelete}
        >
          {t('common.delete')}
        </Button>
      ) : null}
    </div>
  );
}
