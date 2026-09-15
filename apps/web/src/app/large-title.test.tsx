import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { render, screen } from '@/test/intl';
import { COLLAPSE_THRESHOLD, LargeTitle, SCROLL_CONTAINER_ATTR } from './large-title';

function renderInScroller() {
  const result = render(
    <div {...{ [SCROLL_CONTAINER_ATTR]: true }} data-testid="scroller">
      <LargeTitle title="Trang chủ" />
    </div>,
  );
  return { ...result, scroller: screen.getByTestId('scroller') };
}

function scrollTo(scroller: HTMLElement, top: number) {
  Object.defineProperty(scroller, 'scrollTop', { value: top, configurable: true });
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
    // The listener coalesces reads per animation frame; jsdom's rAF is a timer, so flush it.
    vi.runAllTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LargeTitle', () => {
  it('renders the title as the page heading', () => {
    renderInScroller();
    expect(screen.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeInTheDocument();
  });

  it('shows the compact bar once the heading has scrolled away, and hides it again', () => {
    const { scroller, container } = renderInScroller();
    const header = screen.getByRole('heading', { level: 1 }).closest('header');
    const compact = container.querySelector('[data-slot="compact-title"]');
    expect(header).toHaveAttribute('data-collapsed', 'false');
    expect(compact).toHaveClass('opacity-0');

    scrollTo(scroller, COLLAPSE_THRESHOLD + 1);
    expect(header).toHaveAttribute('data-collapsed', 'true');
    expect(compact).toHaveClass('opacity-100');
    expect(compact).toHaveTextContent('Trang chủ');

    scrollTo(scroller, 0);
    expect(header).toHaveAttribute('data-collapsed', 'false');
    expect(compact).toHaveClass('opacity-0');
  });

  it('never animates the heading itself: no transition classes on it', () => {
    renderInScroller();
    const header = screen.getByRole('heading', { level: 1 }).closest('header');
    expect(header?.className).not.toMatch(/transition/);
    expect(screen.getByRole('heading', { level: 1 }).className).not.toMatch(/transition/);
  });

  it('places a leading control ahead of the title, and none by default', () => {
    const { rerender } = render(<LargeTitle title="Trang chủ" />);
    const heading = () => screen.getByRole('heading', { level: 1 });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <LargeTitle title="Trang chủ" leading={<button type="button">Quay lại</button>}>
        <span>x</span>
      </LargeTitle>,
    );
    const back = screen.getByRole('button', { name: 'Quay lại' });
    expect(back).toBeInTheDocument();
    // Ahead of the title in the reading order, which is what a back item has to be.
    expect(back.compareDocumentPosition(heading())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
