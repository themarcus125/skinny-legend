import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import { render, screen, waitFor, within } from '@/test/intl';
import { MemberDetail } from './member-detail';

/** The fixed day the whole plan pins its fixtures to. */
const SEED_DAY = '2026-09-14';
/** "Linh", rank 1 in the seeded group — 14 confirmed entries. */
const MEMBER_ID = '22222222-2222-4222-8222-22222222aaaa';
/** Nobody: the board has no row for it and the history comes back empty. */
const STRANGER_ID = '00000000-0000-4000-8000-000000000000';

const seeded = (historyPageSize?: number) =>
  createMockApiClient({ seed: makeSeed(SEED_DAY), ...(historyPageSize ? { historyPageSize } : {}) });

function Location() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}

function renderMember(api: ApiClient, userId = MEMBER_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter initialEntries={[`/leaderboard/${userId}`]}>
          <Routes>
            <Route path="/leaderboard" element={<span data-testid="board-route" />} />
            <Route path="/leaderboard/:userId" element={<>{children}</>} />
          </Routes>
          <Location />
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<MemberDetail />, { wrapper: Wrapper });
}

describe('the member detail screen', () => {
  it('renders the header card from the leaderboard row and the history as one card', async () => {
    renderMember(seeded());
    expect(await screen.findByTestId('member-name')).toHaveTextContent('Linh');
    expect(screen.getByText('Hạng 1')).toBeInTheDocument();
    expect(screen.getByTestId('member-total')).toHaveTextContent('46');
    // The large title carries the member's name, the way `navigationTitle` does on iOS.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Linh');

    const card = await screen.findByTestId('history-card');
    const rows = within(card).getAllByTestId('history-row');
    expect(rows).toHaveLength(14);
    // The day reads as iOS's `LocalDay.display`: weekday, then dd/MM.
    expect(within(rows[0]!).getByTestId('history-day')).toHaveTextContent('Thứ Hai, 14/09');
    expect(within(rows[1]!).getByTestId('history-place')).toHaveTextContent('Hồ bơi Lam Sơn');
    expect(within(rows[1]!).getAllByTestId('category-chip').length).toBeGreaterThan(0);
  });

  it('is a single page terminal state when the whole history fits', async () => {
    renderMember(seeded());
    await screen.findByTestId('history-card');
    const footer = screen.getByTestId('history-footer');
    expect(footer).toHaveAttribute('data-has-more', 'false');
    expect(within(footer).queryByRole('button')).not.toBeInTheDocument();
  });

  it('loads the next page from the footer and stops on the last one', async () => {
    renderMember(seeded(6));
    const before = (await screen.findAllByTestId('history-row')).length;
    expect(before).toBe(6);
    expect(screen.getByTestId('history-footer')).toHaveAttribute('data-has-more', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('history-row').length).toBeGreaterThan(before);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => {
      expect(screen.getByTestId('history-footer')).toHaveAttribute('data-has-more', 'false');
    });
    expect(screen.getAllByTestId('history-row')).toHaveLength(14);
    // No double-fire: three pages for fourteen entries at six a page, and not one more.
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('shows the empty state for a member with no activity', async () => {
    const api = seeded();
    vi.spyOn(api, 'userEntries').mockResolvedValue({ entries: [], nextCursor: null });
    renderMember(api, STRANGER_ID);
    expect(await screen.findByText('Thành viên này chưa có hoạt động nào.')).toBeInTheDocument();
    expect(screen.queryByTestId('history-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('history-footer')).not.toBeInTheDocument();
  });

  it('shows an alert with a retry when the history fails', async () => {
    const api = seeded();
    const userEntries = vi.spyOn(api, 'userEntries').mockRejectedValueOnce(new Error('boom'));
    renderMember(api);
    expect(await screen.findByText('Không tải được hoạt động của thành viên.')).toBeInTheDocument();
    userEntries.mockRestore();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByTestId('history-card')).toBeInTheDocument();
  });

  it('goes back to the board from the large-title bar', async () => {
    renderMember(seeded());
    await screen.findByTestId('member-name');
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/leaderboard');
    });
    expect(screen.getByTestId('board-route')).toBeInTheDocument();
  });
});
