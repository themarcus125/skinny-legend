import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import { stubApi } from '@/test/session';
import { render, screen, waitFor, within } from '@/test/intl';
import { Feed } from './feed';

/** The fixed day the whole plan pins its fixtures to. */
const SEED_DAY = '2026-09-14';

const seeded = () => createMockApiClient({ seed: makeSeed(SEED_DAY) });

function renderFeed(api: ApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter initialEntries={['/feed']}>{children}</MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<Feed />, { wrapper: Wrapper });
}

describe('the group feed', () => {
  it('groups the entries into day sections and links to the map', async () => {
    renderFeed(seeded());
    const days = await screen.findAllByTestId('feed-day');
    expect(days.length).toBeGreaterThan(1);

    // Newest day first, and the heading reads as iOS's `LocalDay.display`: weekday, then dd/MM.
    const dates = days.map((day) => day.getAttribute('data-date'));
    expect(dates).toEqual([...dates].sort().reverse());
    expect(within(days[0]!).getByTestId('feed-day-heading')).toHaveTextContent(/, \d\d\/\d\d$/);

    // Every row carries the author and their chips; a place name only when the entry has one.
    const rows = screen.getAllByTestId('feed-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(within(rows[0]!).getByTestId('feed-author').textContent).not.toBe('');
    expect(within(rows[0]!).getAllByTestId('category-chip').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('feed-place').length).toBeGreaterThan(0);

    // The toolbar link iOS puts in the navigation bar.
    const link = screen.getByRole('link', { name: 'Bản đồ' });
    expect(link).toHaveAttribute('href', '/feed/map');
  });

  it('loads the next page from the footer and stops on the last one', async () => {
    // The seed holds 70 confirmed entries; the mock's 30-a-page default makes that three pages.
    renderFeed(seeded());
    expect(await screen.findAllByTestId('feed-row')).toHaveLength(30);
    expect(screen.getByTestId('feed-footer')).toHaveAttribute('data-has-more', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('feed-row')).toHaveLength(60);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => {
      expect(screen.getByTestId('feed-footer')).toHaveAttribute('data-has-more', 'false');
    });
    // No double-fire: three pages for seventy entries at thirty a page, and not one more.
    expect(screen.getAllByTestId('feed-row')).toHaveLength(70);
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('shows the catalog empty state when the group has logged nothing', async () => {
    renderFeed(stubApi({ feed: () => Promise.resolve({ entries: [], nextCursor: null }) }));

    expect(await screen.findByText('Chưa có hoạt động nào')).toBeInTheDocument();
    expect(
      screen.getByText('Khi cả nhóm ghi nhận hoạt động, chúng sẽ xuất hiện ở đây.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('feed-footer')).not.toBeInTheDocument();
  });

  it('offers a retry over the error banner when the feed fails', async () => {
    let calls = 0;
    renderFeed(
      stubApi({
        feed: () => {
          calls += 1;
          return Promise.reject(new Error('boom'));
        },
      }),
    );

    expect(await screen.findByText('Không tải được nhật ký nhóm.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => {
      expect(calls).toBeGreaterThan(1);
    });
  });
});
