import { useTranslations } from 'use-intl';
import { EmptyState, SurfaceCard } from '@skinny/ui';
import { LargeTitle } from '@/app/large-title';

export interface PlaceholderScreenProps {
  /** Dotted catalog path for the large title. */
  titleKey: string;
  /** Dotted catalog path for the placeholder body. */
  bodyKey: string;
}

/**
 * Every route in the spec exists from this task on, so the router, the tab bar, the deep links
 * and the e2e smoke test are all exercised against the real shape. Tasks 6–14 replace these
 * bodies one screen at a time; the title is already the screen's own catalog key, so nothing
 * here is throwaway copy.
 */
export function PlaceholderScreen({ titleKey, bodyKey }: PlaceholderScreenProps) {
  const t = useTranslations();
  return (
    <>
      <LargeTitle title={t(titleKey)} />
      <div className="px-4 pt-2">
        <SurfaceCard as="section">
          <EmptyState title={t(bodyKey)} className="py-6" />
        </SurfaceCard>
      </div>
    </>
  );
}
