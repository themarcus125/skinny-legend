import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { render, screen } from '@/test/intl';
import { COLLAPSE_THRESHOLD, LargeTitle, SCROLL_CONTAINER_ATTR } from './large-title';

function renderInScroller() {
  const result = render(
    <div {...{ [SCROLL_CONTAINER_ATTR]: true }} data-testid="scroller">
      <LargeTitle title="Tổng quan" />
    </div>,
  );
  return { ...result, scroller: screen.getByTestId('scroller') };
}

function scrollTo(scroller: HTMLElement, top: number) {
  Object.defineProperty(scroller, 'scrollTop', { value: top, configurable: true });
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
  });
}

describe('LargeTitle', () => {
  it('renders the title as the page heading', () => {
    renderInScroller();
    expect(screen.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeInTheDocument();
  });

  it('collapses once its scroll container passes the threshold, and expands again', () => {
    const { scroller } = renderInScroller();
    const header = screen.getByRole('heading', { level: 1 }).closest('header');
    expect(header).toHaveAttribute('data-collapsed', 'false');

    scrollTo(scroller, COLLAPSE_THRESHOLD + 1);
    expect(header).toHaveAttribute('data-collapsed', 'true');

    scrollTo(scroller, 0);
    expect(header).toHaveAttribute('data-collapsed', 'false');
  });
});
