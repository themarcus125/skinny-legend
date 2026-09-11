import { ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FeedbackItem } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {items.map((item) => (
        <article key={item.id} className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
              >
                {item.user.displayName.charAt(0).toUpperCase()}
              </span>
              <p className="text-sm font-semibold">{item.user.displayName}</p>
            </div>
            <div className="flex items-center gap-2">
              {item.appVersion ? <Badge variant="secondary">{item.appVersion}</Badge> : null}
              <span className="text-label tabular-nums text-muted-foreground">{formatDateTime(item.createdAt)}</span>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-base text-foreground">{item.message}</p>
          {item.screenshotUrl ? (
            <a
              href={item.screenshotUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring text-sm font-medium text-brand-fg underline-offset-4 hover:underline"
            >
              <ImageIcon aria-hidden className="size-4" />
              Xem ảnh chụp màn hình
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
