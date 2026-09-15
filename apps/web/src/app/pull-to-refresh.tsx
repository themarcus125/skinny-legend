import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { SCROLL_CONTAINER_ATTR } from './large-title';

/** How far (in px, after resistance) the finger has to travel before a release refreshes. */
export const PULL_THRESHOLD = 64;
/** The strip never grows past this, however far the finger goes. */
export const PULL_MAX = 96;
/** Finger travel is halved so the strip lags the drag — the rubber-band feel. */
const RESISTANCE = 0.5;

export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing';

/** The strip's height for a raw downward drag of `dy` px. Pure, so the feel is unit-testable. */
export function pullDistance(dy: number): number {
  return Math.max(0, Math.min(PULL_MAX, dy * RESISTANCE));
}

export interface PullToRefreshProps {
  /** The queries a pull refetches — every one active on the screen. */
  keys: readonly QueryKey[];
}

/**
 * iOS-style pull-to-refresh for a screen inside the shell. Rendered as the first child of the
 * screen, ahead of its `<LargeTitle>`: it is a strip of zero height that grows with a downward
 * drag from the top of the scroll container, pushing the title and the content down with it,
 * and refetches `keys` when released past `PULL_THRESHOLD`.
 *
 * Like `LargeTitle` it finds the container itself (`[data-scroll-container]`), so a screen drops
 * it in without threading a ref. Touch only: a mouse has the reload buttons.
 *
 * The listeners are passive — the browser keeps its own overscroll — so the strip is purely
 * additive and can never trap a scroll. A drag that starts anywhere but the very top, or that
 * turns upward, is left to the container.
 */
export function PullToRefresh({ keys }: PullToRefreshProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PullState>('idle');
  const [distance, setDistance] = useState(0);
  const startY = useRef<number | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    setState('refreshing');
    setDistance(PULL_THRESHOLD);
    try {
      await Promise.all(
        keys.map((queryKey) => queryClient.refetchQueries({ queryKey, type: 'active' })),
      );
    } finally {
      if (alive.current) {
        setState('idle');
        setDistance(0);
      }
    }
  }, [keys, queryClient]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const container = element.closest<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`);
    if (!container) return;

    const onStart = (event: TouchEvent) => {
      if (state === 'refreshing') return;
      startY.current = container.scrollTop <= 0 ? (event.touches[0]?.clientY ?? null) : null;
    };
    const onMove = (event: TouchEvent) => {
      if (startY.current === null || state === 'refreshing') return;
      if (container.scrollTop > 0) {
        startY.current = null;
        setDistance(0);
        setState('idle');
        return;
      }
      const next = pullDistance((event.touches[0]?.clientY ?? startY.current) - startY.current);
      setDistance(next);
      setState(next === 0 ? 'idle' : next >= PULL_THRESHOLD ? 'armed' : 'pulling');
    };
    const onEnd = () => {
      if (startY.current === null || state === 'refreshing') return;
      startY.current = null;
      if (state === 'armed') void refresh();
      else {
        setDistance(0);
        setState('idle');
      }
    };

    container.addEventListener('touchstart', onStart, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: true });
    container.addEventListener('touchend', onEnd);
    container.addEventListener('touchcancel', onEnd);
    return () => {
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      container.removeEventListener('touchcancel', onEnd);
    };
  }, [refresh, state]);

  const label =
    state === 'refreshing'
      ? t('common.refreshing')
      : state === 'armed'
        ? t('common.releaseToRefresh')
        : t('common.pullToRefresh');

  return (
    <div
      ref={ref}
      data-testid="pull-to-refresh"
      data-state={state}
      role="status"
      aria-live="polite"
      aria-hidden={state === 'idle'}
      style={{ height: distance }}
      className={cn(
        'flex items-end justify-center overflow-hidden',
        // The strip snaps shut on its own; only the finger moves it instantly.
        state === 'idle' || state === 'refreshing' ? 'transition-[height] duration-200' : '',
      )}
    >
      <div className="text-foreground-subtle flex items-center gap-2 pb-2">
        <span
          aria-hidden="true"
          className={cn(
            'border-foreground-subtle size-4 rounded-full border-2 border-r-transparent',
            state === 'refreshing' ? 'animate-spin' : '',
            state === 'armed' ? 'rotate-180 transition-transform' : 'transition-transform',
          )}
        />
        <span className="type-caption">{state === 'idle' ? '' : label}</span>
      </div>
    </div>
  );
}
