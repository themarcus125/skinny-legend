import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { FeedbackItem } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const t = useTranslations('feedback');
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {items.map((item) => (
        <article key={item.id} className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-secondary-foreground"
              >
                {item.user.displayName.charAt(0).toUpperCase()}
              </span>
              <p className="text-base font-semibold">{item.user.displayName}</p>
            </div>
            <div className="flex items-center gap-2">
              {item.appVersion ? <Badge variant="secondary">{item.appVersion}</Badge> : null}
              <span className="type-label shrink-0 tabular-nums text-foreground-subtle">{formatDateTime(item.createdAt)}</span>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-base text-foreground">{item.message}</p>
          {item.screenshotUrl ? (
            <a
              href={item.screenshotUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring text-sm font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              <ImageIcon aria-hidden className="size-4" />
              {t('viewScreenshot')}
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
