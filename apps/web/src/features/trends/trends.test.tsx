import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import type { HistoryResponse, TrendsResponse } from '@skinny/shared/wire';
import { ApiProvider } from '@/lib/api';
import type { Locale } from '@/i18n/locale';
import { render, screen, waitFor, within } from '@/test/intl';

/**
 * Recharts measures its container through `ResizeObserver` and refuses to draw at 0×0, neither
 * of which jsdom has. Both stubs sit at the library boundary rather than inside the screen: the
 * real `BarChart` still lays the bars out, so `weekly-bars.tsx`'s custom shape — the thing this
 * file asserts — is exercised by the real Recharts code path.
 */
beforeEach(() => {
  // Per test, not once at module scope: `vitest.setup.ts` calls `vi.unstubAllGlobals()` after
  // every test, so a module-level stub would only survive the first one.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    /** Hands the chart a fixed size, which is all the real container's measurement would do. */
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
            width: 640,
            height: 220,
          })
        : children,
  };
});

const { Trends } = await import('./trends');

/**
 * Two ISO weeks, one of them straddling a Sunday, so the heatmap has two rows and the week
 * numbering is exercised: 2026-09-13 is a Sunday in W37, 2026-09-14 the Monday that opens W38.
 */
const WEEKS: TrendsResponse['weeks'] = [
  { week: '2026-W37', mine: 12, groupAvg: 8.5, rank: 2 },
  { week: '2026-W38', mine: 21, groupAvg: 11, rank: 1 },
];

const HEATMAP: TrendsResponse['heatmap'] = [
  { date: '2026-09-11', points: 0 },
  { date: '2026-09-13', points: 4 },
  { date: '2026-09-14', points: 12 },
  { date: '2026-09-15', points: 2 },
];

const TRENDS: TrendsResponse = {
  weeks: WEEKS,
  heatmap: HEATMAP,
  byCategory: { exercise: 18, meal: 9, group: 6 },
  streakBonus: 8,
};

const EMPTY: TrendsResponse = {
  weeks: [],
  heatmap: [],
  byCategory: { exercise: 0, meal: 0, group: 0 },
  streakBonus: 0,
};

function historyEntry(id: string, localDate: string, placeName: string | null) {
  return {
    id,
    userId: 'me',
    localDate,
    takenAt: `${localDate}T02:00:00.000Z`,
    createdAt: `${localDate}T02:05:00.000Z`,
    status: 'confirmed' as const,
    categories: ['exercise' as const],
    photoUrl: `https://cdn.example/${id}.webp`,
    thumbUrl: null,
    placeName,
    placeSource: placeName ? ('osm' as const) : ('none' as const),
    lat: null,
    lng: null,
    points: 5,
  };
}

/** Newest first, two pages — the shape `GET /entries/mine` actually answers with. */
const PAGES: HistoryResponse[] = [
  {
    entries: [
      historyEntry('e-15', '2026-09-15', 'Hồ bơi Lam Sơn'),
      historyEntry('e-14a', '2026-09-14', 'Công viên Tao Đàn'),
    ],
    nextCursor: 'c1',
  },
  {
    entries: [historyEntry('e-14b', '2026-09-14', null), historyEntry('e-13', '2026-09-13', null)],
    nextCursor: null,
  },
];

function stubApi(overrides: Partial<ApiClient>): ApiClient {
  return {
    trends: () => Promise.resolve(TRENDS),
    myEntries: (cursor?: string) =>
      Promise.resolve(cursor === 'c1' ? PAGES[1]! : PAGES[0]!),
    ...overrides,
  } as unknown as ApiClient;
}

function renderTrends(api: ApiClient = stubApi({}), locale: Locale = 'vi') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter initialEntries={['/trends']}>{children}</MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<Trends />, { wrapper: Wrapper, locale });
}

describe('the trends screen', () => {
  it('draws one bar per returned week with my points and the group average', async () => {
    renderTrends();

    const bars = await screen.findAllByTestId('week-bar');
    expect(bars).toHaveLength(WEEKS.length);
    expect(bars.map((bar) => bar.getAttribute('data-points'))).toEqual(['12', '21']);
    // The second series is the group average, drawn beside mine rather than stacked on it.
    const averages = screen.getAllByTestId('week-bar-avg');
    expect(averages.map((bar) => bar.getAttribute('data-points'))).toEqual(['8.5', '11']);
    // A taller value is a taller rect — the bars are not all painted the same height.
    const height = (bar: Element) => Number(bar.getAttribute('height'));
    expect(height(bars[1]!)).toBeGreaterThan(height(bars[0]!));
    expect(height(bars[0]!)).toBeGreaterThan(height(averages[0]!));
  });

  it('names the chart and repeats it as a table for a reader', async () => {
    renderTrends();

    // The bars are a picture; this is the summary and the numbers behind it.
    const chart = await screen.findByRole('img', {
      name: 'Điểm theo tuần: Bạn, Trung bình nhóm',
    });
    expect(chart).toBeInTheDocument();
    // Nothing inside the picture may take focus or claim a role of its own: Recharts' own
    // accessibility layer would otherwise put a `role="application"` tabstop under `role="img"`.
    expect(chart.querySelector('[role="application"]')).toBeNull();
    expect(chart.querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull();

    const table = screen.getByTestId('weekly-bars-table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Tuần',
      'Bạn',
      'Trung bình nhóm',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(WEEKS.length);
    expect(rows[0]).toHaveTextContent('T37');
    expect(rows[0]).toHaveTextContent('12');
    expect(rows[0]).toHaveTextContent('8.5');
    expect(rows[1]).toHaveTextContent('21');
    // The legend reads in the bars' order, mine first.
    const legend = within(screen.getByTestId('weekly-bars-legend')).getAllByRole('listitem', {
      hidden: true,
    });
    expect(legend.map((item) => item.textContent)).toEqual(['Bạn', 'Trung bình nhóm']);
  });

  it('renders the active-days heatmap with one cell per returned day', async () => {
    renderTrends();

    const cells = await screen.findAllByTestId('heat-cell');
    expect(cells).toHaveLength(HEATMAP.length);
    // Five buckets: nothing, 3–4, 7+, 1–2 — and the level is what picks the ramp step.
    expect(cells.map((cell) => cell.getAttribute('data-level'))).toEqual(['0', '2', '4', '1']);
    // Monday-first columns: Friday the 11th is column 6, Sunday the 13th column 8.
    expect(cells[0]).toHaveStyle({ gridColumnStart: '6' });
    expect(cells[1]).toHaveStyle({ gridColumnStart: '8' });
    // Two ISO weeks, oldest first, each labelled from the catalog.
    const rows = screen.getAllByTestId('heat-week');
    expect(rows.map((row) => row.getAttribute('data-week'))).toEqual(['2026-W37', '2026-W38']);
    expect(screen.getAllByTestId('heat-week-label').map((label) => label.textContent)).toEqual([
      'T37',
      'T38',
    ]);
    // Every square names itself, so the grid is readable and reachable without the chart.
    expect(cells[2]).toHaveAccessibleName('Thứ Hai, 14/09: 12 điểm');
    expect(cells[0]).toHaveAccessibleName('Thứ Sáu, 11/09: không hoạt động');
  });

  it('labels the axes in the active language', async () => {
    renderTrends(stubApi({}), 'en');

    // The week number reads the same on the bar axis, in its hidden table and in the heatmap's
    // row gutter, so the axis itself is what gets scoped here.
    const bars = await screen.findByTestId('weekly-bars');
    const axis = bars.querySelector('svg.recharts-surface');
    expect(axis?.textContent).toContain('W37');
    expect(axis?.textContent).toContain('W38');
    expect(within(screen.getByTestId('weekly-bars-table')).getByText('W38')).toBeInTheDocument();
    expect(screen.getAllByTestId('heat-week-label').map((label) => label.textContent)).toEqual([
      'W37',
      'W38',
    ]);
    expect(screen.getAllByTestId('heat-weekday').map((cell) => cell.textContent)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(screen.getAllByTestId('heat-cell')[2]).toHaveAccessibleName('Monday, 14/09: 12 points');
  });

  it('shows the per-category totals and the streak bonus', async () => {
    renderTrends();

    expect(await screen.findByTestId('streak-bonus')).toHaveTextContent('8');
    const totals = screen.getAllByTestId('category-total');
    expect(totals).toHaveLength(3);
    expect(totals.map((row) => row.getAttribute('data-category'))).toEqual([
      'exercise',
      'meal',
      'group',
    ]);
    expect(totals[0]).toHaveTextContent('Tập luyện');
    expect(totals[0]).toHaveTextContent('18');
    expect(totals[2]).toHaveTextContent('6');
  });

  it('renders an empty state before any entry exists', async () => {
    renderTrends(stubApi({ trends: () => Promise.resolve(EMPTY) }));

    expect(await screen.findByText('Chưa có hoạt động nào')).toBeInTheDocument();
    expect(screen.queryByTestId('heatmap')).not.toBeInTheDocument();
  });

  it('says so when there are weeks but no days behind them', async () => {
    renderTrends(stubApi({ trends: () => Promise.resolve({ ...TRENDS, heatmap: [] }) }));

    expect(await screen.findByText('Không có hoạt động')).toBeInTheDocument();
    expect(screen.queryByTestId('heatmap')).not.toBeInTheDocument();
    // Still a real screen: the bars and the totals are there.
    expect(screen.getAllByTestId('week-bar')).toHaveLength(WEEKS.length);
  });

  it('offers a retry when the load fails', async () => {
    const trends = vi
      .fn<() => Promise<TrendsResponse>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(TRENDS);
    renderTrends(stubApi({ trends }));

    expect(await screen.findByText('Không tải được xu hướng.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findAllByTestId('week-bar')).toHaveLength(WEEKS.length);
  });

  it('opens the day sheet on a heatmap square, with that day’s entries only', async () => {
    renderTrends();

    const cells = await screen.findAllByTestId('heat-cell');
    await userEvent.click(cells[2]!);

    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveAccessibleName('Thứ Hai, 14/09');
    // Both of the 14th's entries, across two pages of the newest-first cursor feed — and
    // neither the 15th's nor the 13th's.
    await waitFor(() =>
      expect(within(sheet).getAllByTestId('day-entry')).toHaveLength(2),
    );
    expect(
      within(sheet)
        .getAllByTestId('day-entry')
        .map((row) => row.getAttribute('data-entry-id')),
    ).toEqual(['e-14a', 'e-14b']);

    await userEvent.click(within(sheet).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says so when a square has no entries behind it', async () => {
    renderTrends();

    const cells = await screen.findAllByTestId('heat-cell');
    await userEvent.click(cells[0]!);

    const sheet = await screen.findByRole('dialog');
    expect(
      await within(sheet).findByText('Ngày này bạn chưa ghi nhận hoạt động nào.'),
    ).toBeInTheDocument();
  });

  /**
   * The seeded group is what Playwright and the Pages preview run on, so the screen is rendered
   * once against the real mock client rather than a hand-written fixture: the bars, the grid and
   * the totals all have to survive whatever `makeSeed` produced for today.
   */
  it('renders the seeded group end to end', async () => {
    const api = createMockApiClient({ seed: makeSeed('2026-09-15') }) as unknown as ApiClient;
    const expected = await api.trends();
    renderTrends(api);

    expect(await screen.findAllByTestId('week-bar')).toHaveLength(expected.weeks.length);
    expect(screen.getAllByTestId('heat-cell')).toHaveLength(expected.heatmap.length);
    expect(screen.getByTestId('streak-bonus')).toHaveTextContent(String(expected.streakBonus));
    expect(screen.getAllByTestId('category-total')).toHaveLength(3);
  });
});
