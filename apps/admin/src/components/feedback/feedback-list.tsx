import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FeedbackItem } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="text-base">{item.user.displayName}</CardTitle>
            <div className="flex items-center gap-2">
              {item.appVersion ? <Badge variant="secondary">{item.appVersion}</Badge> : null}
              <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap text-sm">{item.message}</p>
            {item.screenshotUrl ? (
              <a
                href={item.screenshotUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4"
              >
                Xem ảnh chụp màn hình
              </a>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
