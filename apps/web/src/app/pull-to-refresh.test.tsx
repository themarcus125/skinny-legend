import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@/test/intl';
import { SCROLL_CONTAINER_ATTR } from './large-title';
import { PULL_MAX, PULL_THRESHOLD, PullToRefresh, pullDistance } from './pull-to-refresh';

const KEYS = [['dashboard'], ['feed']] as const;

/** The strip inside a stand-in for the shell's scroll container, so it can find its target. */
function renderStrip(queryClient = new QueryClient()) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <main {...{ [SCROLL_CONTAINER_ATTR]: true }} data-testid="container">
        {children}
      </main>
    </QueryClientProvider>
  );
  render(<PullToRefresh keys={KEYS} />, { wrapper: Wrapper });
  return { container: screen.getByTestId('container'), strip: screen.getByTestId('pull-to-refresh') };
}

const touch = (clientY: number) => ({ touches: [{ clientY }] });

describe('pullDistance', () => {
  it('halves the drag, never goes negative, and caps at the maximum', () => {
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(40)).toBe(20);
    expect(pullDistance(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
    expect(pullDistance(10_000)).toBe(PULL_MAX);
  });
});

describe('PullToRefresh', () => {
  it('starts closed and hidden from assistive tech', () => {
    const { strip } = renderStrip();
    expect(strip).toHaveAttribute('data-state', 'idle');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip).toHaveStyle({ height: '0px' });
  });

  it('grows with a drag from the top, arms past the threshold and refetches on release', async () => {
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    const { container, strip } = renderStrip(queryClient);

    fireEvent.touchStart(container, touch(100));
    fireEvent.touchMove(container, touch(160));
    expect(strip).toHaveAttribute('data-state', 'pulling');
    expect(strip).toHaveTextContent('Kéo xuống để làm mới');
    expect(strip).toHaveStyle({ height: '30px' });

    fireEvent.touchMove(container, touch(100 + PULL_THRESHOLD * 2));
    expect(strip).toHaveAttribute('data-state', 'armed');
    expect(strip).toHaveTextContent('Thả để làm mới');

    act(() => {
      fireEvent.touchEnd(container);
    });
    expect(refetch).toHaveBeenCalledTimes(KEYS.length);
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['dashboard'], type: 'active' });
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['feed'], type: 'active' });
    await waitFor(() => expect(strip).toHaveAttribute('data-state', 'idle'));
    expect(strip).toHaveStyle({ height: '0px' });
  });

  it('a short pull snaps shut without refetching', () => {
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const { container, strip } = renderStrip(queryClient);

    fireEvent.touchStart(container, touch(100));
    fireEvent.touchMove(container, touch(120));
    expect(strip).toHaveAttribute('data-state', 'pulling');
    act(() => {
      fireEvent.touchEnd(container);
    });
    expect(refetch).not.toHaveBeenCalled();
    expect(strip).toHaveAttribute('data-state', 'idle');
  });

  it('ignores a drag that starts while the container is scrolled', () => {
    const { container, strip } = renderStrip();
    Object.defineProperty(container, 'scrollTop', { value: 120, configurable: true });

    fireEvent.touchStart(container, touch(100));
    fireEvent.touchMove(container, touch(300));
    expect(strip).toHaveAttribute('data-state', 'idle');
    expect(strip).toHaveStyle({ height: '0px' });
  });
});
