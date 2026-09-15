import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@skinny/ui';

/**
 * Scroll (px) past which the compact bar shows when the large header's own height cannot be
 * measured (jsdom); a real header measures itself and uses that instead.
 */
export const COLLAPSE_THRESHOLD = 40;

/** The shell marks its scroll container with this attribute; see `shell.tsx`. */
export const SCROLL_CONTAINER_ATTR = 'data-scroll-container';

export interface LargeTitleProps {
  title: string;
  /**
   * A leading control ahead of the title — the back button on a pushed screen such as the
   * member detail, which is where iOS puts the navigation bar's back item.
   */
  leading?: ReactNode;
  /** Trailing controls — a filter, a reload button — pinned beside the title. */
  children?: ReactNode;
}

/**
 * iOS-style large title. The big heading sits in the normal flow and scrolls away like any
 * other content — nothing about it animates — and a compact bar pinned to the top fades in once
 * it is gone, so the screen keeps its name. That is the two-element arrangement UIKit uses; the
 * earlier version shrank the one sticky header in place, which meant a font-size and padding
 * transition on every scroll event and read as sluggish on a phone.
 *
 * It finds its own scroll container (`[data-scroll-container]`) rather than being handed one, so
 * a screen can drop it in without threading a ref, and falls back to the window when it is
 * rendered outside the shell. Scroll reads are coalesced per animation frame.
 *
 * `data-collapsed` on the header is the state, exposed as an attribute so it is assertable
 * without measuring fonts. The compact bar is `aria-hidden`: the heading is the one name.
 */
export function LargeTitle({ title, leading, children }: LargeTitleProps) {
  const ref = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const container = element.closest<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`);
    const target: HTMLElement | Window = container ?? window;
    const read = () => (container ? container.scrollTop : window.scrollY);
    // The bar appears as the heading's bottom edge leaves the top of the viewport.
    const threshold = () => Math.max(element.offsetHeight, COLLAPSE_THRESHOLD);
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        setCollapsed(read() > threshold());
      });
    };
    setCollapsed(read() > threshold());
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/*
        The compact bar: a zero-height sticky anchor so it takes no room in the flow, with the
        bar itself hung off it. Opacity is the only thing that changes, which the compositor
        handles without touching layout.
      */}
      <div className="sticky top-0 z-10 h-0" aria-hidden="true">
        <div
          data-slot="compact-title"
          className={cn(
            'bg-background/90 border-border flex h-11 items-center justify-center border-b px-4 backdrop-blur',
            'pt-[env(safe-area-inset-top)] box-content transition-opacity duration-150',
            collapsed ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <span className="type-h3 truncate">{title}</span>
        </div>
      </div>

      <header
        ref={ref}
        data-slot="large-title"
        data-collapsed={collapsed ? 'true' : 'false'}
        className="flex items-end justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {leading ? <div className="-ml-2 shrink-0">{leading}</div> : null}
          <h1 className="type-h1 min-w-0 truncate">{title}</h1>
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
      </header>
    </>
  );
}
