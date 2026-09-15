import { useEffect, useRef } from 'react';
import { SCROLL_CONTAINER_ATTR } from '@/app/large-title';

/**
 * Fires `onReach` when the element scrolls into the shell's scroll container — the web stand-in
 * for iOS's `.task` on the last row (`FeedModel.loadNextPageIfNeeded(after:)`).
 *
 * It roots the observer on `[data-scroll-container]` rather than the viewport because the shell
 * scrolls a div, not the window, and because rows can sit inside a card that lays out more than
 * the reader has actually reached. Falls back to doing nothing where `IntersectionObserver` is
 * missing (jsdom) — the footer's "Tải thêm" button is then the only way on, which is exactly
 * what the tests drive.
 *
 * Callers pass `hasMore && !isFetchingNextPage` as `enabled`: that is what keeps an observer
 * that fires twice (a resize, a re-observe) from requesting the same page twice.
 *
 * Extracted from `features/leaderboard/member-detail.tsx` (Task 9) when the feed needed the
 * same footer paging; both screens now share this one copy.
 */
export function useEndSentinel(enabled: boolean, onReach: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled || typeof IntersectionObserver === 'undefined') return;
    const root = element.closest<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`);
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) onReach();
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, onReach]);
  return ref;
}
