import { Badge } from '@/components/ui/badge';
import type { Category } from '@/lib/api/types';
import { CATEGORY_LABELS } from '@/lib/labels';

export function CategoryChips({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((category) => (
        <Badge key={category} variant="secondary">
          {CATEGORY_LABELS[category]}
        </Badge>
      ))}
    </div>
  );
}
