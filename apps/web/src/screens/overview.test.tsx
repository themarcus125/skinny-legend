import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import type { DashboardDto } from '@skinny/shared/wire';
import { ApiError } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { filledDots } from '@skinny/ui';
import { ApiProvider } from '@/lib/api';
import { render, screen, within } from '@/test/intl';
import { Overview } from './overview';

/** The fixed day the whole plan pins its fixtures to, so every number below is deterministic. */
const SEED_DAY = '2026-09-14';

function mockApi(): ApiClient {
  return createMockApiClient({ seed: makeSeed(SEED_DAY) });
}

/**
 * The mock client is a class, so a plain spread drops every prototype method — which used to be
 * harmless when only `dashboard()` was read off the copy, and is not now that Trang chủ also
 * calls `feed()`. This keeps the prototype and layers the overrides on top.
 */
function withOverrides(api: ApiClient, overrides: Partial<ApiClient>): ApiClient {
  return Object.assign(Object.create(Object.getPrototypeOf(api) as object) as ApiClient, api, overrides);
}

/**
 * An `ApiClient` whose `dashboard()` always rejects — the error-banner path. Its `feed()` is the
 * seed's, deliberately: the two halves of Trang chủ are separate queries and the failing one
 * must not take the other down with it.
 */
function failingApi(error: Error): ApiClient {
  return withOverrides(mockApi(), { dashboard: () => Promise.reject(error) });
}

/** The seed's dashboard with a few fields overridden — the branches the fixture does not cover. */
async function patchedApi(patch: (dashboard: DashboardDto) => DashboardDto): Promise<ApiClient> {
  const api = mockApi();
  const dashboard = patch(await api.dashboard());
  return withOverrides(api, { dashboard: () => Promise.resolve(dashboard) });
}

function renderOverview(ui: ReactElement, { api = mockApi() }: { api?: ApiClient } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter>{children}</MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

/**
 * The dots are derived from the streak, not fetched: the rulebook pays the bonus every seven
 * days, so a streak that is an exact multiple of the cycle shows a full row (the bonus day
 * itself), never an empty one. Mirrors `StreakCounterTests` on iOS.
 */
describe('streak dots derivation', () => {
  it('matches the Swift cases', () => {
    expect(filledDots(0)).toBe(0);
    expect(filledDots(7)).toBe(7);
    expect(filledDots(8)).toBe(1);
    expect(filledDots(14)).toBe(7);
  });
});

describe('Overview', () => {
  it('shows today points, the delta, the rank and seven streak dots', async () => {
    renderOverview(<Overview />);

    expect(await screen.findByTestId('today-points')).toHaveTextContent('5');
    // The seed's yesterday matches today, so the delta reads as the "same as yesterday" caption.
    expect(screen.getByTestId('delta')).toHaveTextContent('bằng hôm qua');
    expect(screen.getByLabelText('Bằng hôm qua')).toBeInTheDocument();
    expect(screen.getByTestId('rank')).toHaveTextContent('3');
    expect(screen.getByText('/ 5')).toBeInTheDocument();
    expect(screen.getByText('trong nhóm')).toBeInTheDocument();
    expect(screen.getAllByTestId('streak-dot')).toHaveLength(7);
  });

  it('lights every dot on a seven-day streak and names the previous best', async () => {
    renderOverview(<Overview />);

    await screen.findByTestId('streak-counter');
    const lit = screen.getAllByTestId('streak-dot').filter((dot) => dot.dataset.filled === 'true');
    expect(lit).toHaveLength(7);
    expect(screen.getByText('ngày liên tiếp')).toBeInTheDocument();
    expect(screen.getByText('Dài nhất: 7 ngày')).toBeInTheDocument();
    // iOS passes numberSize 30 to both cards of the pair, so the two numerals match.
    expect(screen.getByText('7')).toHaveStyle({ fontSize: '30px' });
    expect(screen.getByRole('img', { name: '7 trên 7 ngày của chuỗi hiện tại' })).toBeInTheDocument();
  });

  it('renders one checklist row per category, ticking the caps already hit today', async () => {
    renderOverview(<Overview />);

    const rows = await screen.findAllByTestId('checklist-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.dataset.category)).toEqual(['exercise', 'meal', 'group']);
    // The seed has the two daily caps hit and the weekly group cap still open.
    expect(rows.map((row) => row.dataset.done)).toEqual(['true', 'true', 'false']);
    expect(within(rows[0]!).getByText('đã đủ hôm nay')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('+3')).toBeInTheDocument();
    // iOS draws `checkmark.circle.fill` on a done row: the tick is inside the filled circle.
    expect(within(rows[0]!).getByTestId('checklist-mark').querySelector('svg')).not.toBeNull();
    expect(within(rows[2]!).getByTestId('checklist-mark').querySelector('svg')).toBeNull();
  });

  it('shows the challenge total on the ink card, with the feed folded in below', async () => {
    renderOverview(<Overview />);

    const total = await screen.findByTestId('challenge-total');
    expect(total).toHaveTextContent('43');
    expect(total.closest('[data-testid="total-card"]')).not.toBeNull();
    expect(screen.getByText('Thưởng chuỗi: +5')).toBeInTheDocument();
    expect(screen.getByLabelText('Tổng điểm: 43 (thưởng chuỗi 5)')).toBeInTheDocument();
    // The "Nhật ký nhóm" card that used to link to /feed is gone: the feed is on this screen.
    expect(screen.queryByRole('link', { name: 'Nhật ký nhóm' })).not.toBeInTheDocument();
  });

  it('shows the empty caption and a negative delta when nothing was tracked today', async () => {
    const api = await patchedApi((dashboard) => ({
      ...dashboard,
      today: { points: 0, categories: [] },
      deltaVsYesterday: -5,
    }));
    renderOverview(<Overview />, { api });

    expect(await screen.findByTestId('today-empty')).toHaveTextContent(
      'Chưa ghi nhận hoạt động nào hôm nay.',
    );
    expect(screen.getByTestId('delta')).toHaveTextContent('-5 so với hôm qua');
    expect(screen.getByTestId('delta').dataset.sign).toBe('down');
    expect(screen.getByLabelText('Kém hôm qua 5 điểm')).toBeInTheDocument();
    expect(screen.queryByTestId('category-chip')).toBeNull();
  });

  it('spells a positive delta with its sign and a "more than yesterday" label', async () => {
    const api = await patchedApi((dashboard) => ({ ...dashboard, deltaVsYesterday: 3 }));
    renderOverview(<Overview />, { api });

    const delta = await screen.findByTestId('delta');
    expect(delta).toHaveTextContent('+3 so với hôm qua');
    expect(delta.dataset.sign).toBe('up');
    expect(screen.getByLabelText('Hơn hôm qua 3 điểm')).toBeInTheDocument();
  });

  it('renders a skeleton while the dashboard is loading', () => {
    renderOverview(<Overview />);
    expect(screen.getByTestId('overview-skeleton')).toBeInTheDocument();
  });

  it('renders a retryable error banner when the dashboard call fails', async () => {
    renderOverview(<Overview />, { api: failingApi(new ApiError(500, 'internal', 'boom')) });

    const banner = await screen.findByText('Không tải được dữ liệu.');
    expect(banner.closest('[role="alert"]')).toHaveTextContent('Máy chủ gặp sự cố, hãy thử lại sau.');
    expect(
      within(banner.closest('[role="alert"]')!).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
  });
});

/**
 * SKI-134: the group log lives under the dashboard cards, and the two are separate queries so
 * that one failing never blanks the other.
 */
describe('Trang chủ with the feed folded in', () => {
  it('renders the feed section under the dashboard cards', async () => {
    renderOverview(<Overview />);

    expect(await screen.findByTestId('challenge-total')).toBeInTheDocument();
    const feed = screen.getByTestId('feed-section');
    expect(feed).toBeInTheDocument();
    expect(await screen.findAllByTestId('feed-row')).not.toHaveLength(0);
    // Order on the page: the dashboard first, the log after it.
    expect(
      screen.getByTestId('challenge-total').compareDocumentPosition(feed) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the feed on screen when the dashboard call fails', async () => {
    renderOverview(<Overview />, { api: failingApi(new ApiError(500, 'internal', 'boom')) });

    expect(await screen.findByText('Không tải được dữ liệu.')).toBeInTheDocument();
    expect(await screen.findAllByTestId('feed-row')).not.toHaveLength(0);
    expect(screen.queryByTestId('today-points')).not.toBeInTheDocument();
  });

  it('keeps the dashboard on screen when the feed call fails', async () => {
    const api = withOverrides(mockApi(), { feed: () => Promise.reject(new Error('boom')) });
    renderOverview(<Overview />, { api });

    expect(await screen.findByTestId('today-points')).toHaveTextContent('5');
    expect(await screen.findByText('Không tải được nhật ký nhóm.')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-row')).not.toBeInTheDocument();
  });
});
