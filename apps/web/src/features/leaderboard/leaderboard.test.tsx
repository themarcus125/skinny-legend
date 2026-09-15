import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { SessionProvider } from '@/auth/session';
import { ApiProvider } from '@/lib/api';
import { render, screen, waitFor, within } from '@/test/intl';
import { stubAuthPort } from '@/test/session';
import { Leaderboard } from './leaderboard';

/** The fixed day the whole plan pins its fixtures to. */
const SEED_DAY = '2026-09-14';

const seeded = () => createMockApiClient({ seed: makeSeed(SEED_DAY) });

function Location() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}

function renderLeaderboard(api: ApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <SessionProvider auth={stubAuthPort()}>
          <MemoryRouter initialEntries={['/leaderboard']}>
            <Routes>
              <Route path="/leaderboard" element={<>{children}</>} />
              <Route path="/leaderboard/:userId" element={<span data-testid="member-route" />} />
            </Routes>
            <Location />
          </MemoryRouter>
        </SessionProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<Leaderboard />, { wrapper: Wrapper });
}

describe('the Xếp hạng screen', () => {
  it('renders one row per member in competition order', async () => {
    renderLeaderboard(seeded());
    const rows = await screen.findAllByTestId('leaderboard-row');
    expect(rows).toHaveLength(5);
    // Competition ranking: the two leaders tie at 1 and the next three all take 3.
    expect(rows.map((row) => row.dataset.rank)).toEqual(['1', '1', '3', '3', '3']);
  });

  it('puts the BẠN pill on my own row and nowhere else', async () => {
    renderLeaderboard(seeded());
    const rows = await screen.findAllByTestId('leaderboard-row');
    const mine = rows.filter((row) => row.dataset.me === 'true');
    expect(mine).toHaveLength(1);
    expect(within(mine[0]!).getByText('BẠN')).toBeInTheDocument();
    expect(within(mine[0]!).getByText('Khoa')).toBeInTheDocument();
    expect(screen.getAllByText('BẠN')).toHaveLength(1);
  });

  it('shows the weekly delta and the season total on each row', async () => {
    renderLeaderboard(seeded());
    const first = (await screen.findAllByTestId('leaderboard-row'))[0]!;
    expect(within(first).getByTestId('leaderboard-week-delta')).toHaveTextContent('Tuần này +8');
    expect(within(first).getByTestId('leaderboard-total')).toHaveTextContent('46');
    // One whole sentence, the way `LeaderboardRowView.accessibilityLabel(for:)` composes it.
    expect(first).toHaveAccessibleName('Hạng 1, Linh, 46 điểm, tuần này 8 điểm');
  });

  it('navigates to the member detail route on a row click', async () => {
    renderLeaderboard(seeded());
    const rows = await screen.findAllByTestId('leaderboard-row');
    await userEvent.click(rows[1]!);
    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent(/^\/leaderboard\/[\w-]+$/);
    });
    expect(screen.getByTestId('member-route')).toBeInTheDocument();
  });

  it('shows the skeleton first and an alert with a retry when the board fails', async () => {
    const api = seeded();
    const leaderboard = vi
      .spyOn(api, 'leaderboard')
      .mockRejectedValueOnce(new Error('boom'));
    renderLeaderboard(api);
    expect(screen.getByTestId('leaderboard-skeleton')).toBeInTheDocument();

    expect(await screen.findByText('Không tải được bảng xếp hạng.')).toBeInTheDocument();
    leaderboard.mockRestore();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findAllByTestId('leaderboard-row')).toHaveLength(5);
  });

  it('shows the empty state when nobody has scored', async () => {
    const api = seeded();
    vi.spyOn(api, 'leaderboard').mockResolvedValue([]);
    renderLeaderboard(api);
    expect(await screen.findByText('Chưa có điểm nào được ghi nhận.')).toBeInTheDocument();
  });
});
