import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@skinny/ui';

/** Pixels of scroll before the large title shrinks into its compact form. */
export const COLLAPSE_THRESHOLD = 16;

/** The shell marks its scroll container with this attribute; see `shell.tsx`. */
export const SCROLL_CONTAINER_ATTR = 'data-scroll-container';

export interface LargeTitleProps {
  title: string;
  /** Trailing controls — a filter, a "Tải lại" button — pinned beside the title. */
  children?: ReactNode;
}

/**
 * iOS-style large title that collapses on scroll. It finds its own scroll container
 * (`[data-scroll-container]`) rather than being handed one, so a screen can drop it in without
 * threading a ref, and falls back to the window when it is rendered outside the shell.
 *
 * `data-collapsed` is the state, exposed as an attribute so the styling is one CSS hop and the
 * behaviour is assertable without measuring fonts.
 */
export function LargeTitle({ title, children }: LargeTitleProps) {
  const ref = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const container = element.closest<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`);
    const target: HTMLElement | Window = container ?? window;
    const read = () => (container ? container.scrollTop : window.scrollY);
    const onScroll = () => setCollapsed(read() > COLLAPSE_THRESHOLD);
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      ref={ref}
      data-slot="large-title"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'sticky top-0 z-10 flex items-end justify-between gap-3',
        'bg-background/90 px-4 backdrop-blur transition-[padding] duration-200',
        collapsed ? 'pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2' : 'pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-3',
      )}
    >
      <h1
        className={cn(
          'min-w-0 truncate transition-[font-size,line-height] duration-200',
          collapsed ? 'type-h3' : 'type-h1',
        )}
      >
        {title}
      </h1>
      {children ? <div className="shrink-0">{children}</div> : null}
    </header>
  );
}
