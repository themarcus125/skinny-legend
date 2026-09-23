import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import { stubApi } from '@/test/session';
import { render, screen, waitFor, within } from '@/test/intl';
import { FeedSection } from './feed';

/** The fixed day the whole plan pins its fixtures to. */
const SEED_DAY = '2026-09-14';

const seeded = () => createMockApiClient({ seed: makeSeed(SEED_DAY) });

/** Shows the address the section navigated to, so a location tap is assertable end to end. */
function Here() {
  const location = useLocation();
  return <p data-testid="here">{`${location.pathname}${location.search}`}</p>;
}

function renderFeed(api: ApiClient, meId: string | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter initialEntries={['/']}>
          <Here />
          {children}
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<FeedSection meId={meId} />, { wrapper: Wrapper });
}

/**
 * A hand-driven `IntersectionObserver`, because jsdom has none: `useEndSentinel` bails out
 * entirely when the constructor is missing, so without this the sentinel path is untested and
 * only the "Tải thêm" button is ever exercised. The returned function is the scroll.
 */
function stubIntersectionObserver() {
  const callbacks: IntersectionObserverCallback[] = [];
  class Stub {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', Stub);
  return () => {
    for (const callback of callbacks.splice(0)) {
      callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        null as unknown as IntersectionObserver,
      );
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the group feed on Trang chủ', () => {
  it('groups the entries into day sections under its own heading', async () => {
    renderFeed(seeded());
    const days = await screen.findAllByTestId('feed-day');
    expect(days.length).toBeGreaterThan(1);

    // The section names itself: on Trang chủ the <h1> is the screen, not the feed.
    expect(screen.getByRole('heading', { level: 2, name: 'Nhật ký nhóm' })).toBeInTheDocument();

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

    // Beside the heading, a link to the whole map — next to the per-row location buttons.
    expect(screen.getByRole('link', { name: 'Xem bản đồ' })).toHaveAttribute('href', '/feed/map');
  });

  it('opens the tapped location on the map, carrying its entry id', async () => {
    renderFeed(seeded());
    const place = (await screen.findAllByTestId('feed-place'))[0]!;
    const entryId = place.dataset.entryId!;

    // A real control with a label that says what the tap does — not bare text.
    expect(place.tagName).toBe('BUTTON');
    expect(place).toHaveAccessibleName(`Xem ${place.textContent} trên bản đồ`);

    await userEvent.click(place);
    expect(screen.getByTestId('here')).toHaveTextContent(
      `/feed/map?entry=${encodeURIComponent(entryId)}`,
    );
  });

  it('shows the member\'s title and note on the card, and nothing when they wrote none', async () => {
    const page = await seeded().feed();
    renderFeed(
      stubApi({
        feed: () =>
          Promise.resolve({
            entries: [
              { ...page.entries[0]!, id: 'titled', title: 'Chạy bộ buổi sáng', note: 'Mệt nhưng vui.' },
              { ...page.entries[1]!, id: 'plain', title: null, note: null },
            ],
            nextCursor: null,
          }),
      }),
    );

    const rows = await screen.findAllByTestId('feed-row');
    expect(within(rows[0]!).getByTestId('feed-title')).toHaveTextContent('Chạy bộ buổi sáng');
    expect(within(rows[0]!).getByTestId('feed-note')).toHaveTextContent('Mệt nhưng vui.');
    expect(within(rows[1]!).queryByTestId('feed-title')).not.toBeInTheDocument();
    expect(within(rows[1]!).queryByTestId('feed-note')).not.toBeInTheDocument();
  });

  it('leaves a row with no location untappable', async () => {
    // The seed's own first entry with its place stripped — a real `FeedEntryDto`, minus a place.
    const page = await seeded().feed();
    renderFeed(
      stubApi({
        feed: () =>
          Promise.resolve({
            entries: [{ ...page.entries[0]!, placeName: null }],
            nextCursor: null,
          }),
      }),
    );

    expect(await screen.findByTestId('feed-row')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-place')).not.toBeInTheDocument();
    // The photo, the heart and the comment count are buttons; nothing else in the row may be.
    const chrome = new Set(['photo-button', 'feed-heart', 'feed-comment']);
    const buttons = screen
      .queryAllByRole('button')
      .filter((b) => !chrome.has(b.getAttribute('data-testid') ?? ''));
    expect(buttons).toHaveLength(0);
  });

  it('loads the next page when the footer sentinel comes into view', async () => {
    const intersect = stubIntersectionObserver();
    renderFeed(seeded());
    expect(await screen.findAllByTestId('feed-row')).toHaveLength(30);

    intersect();
    await waitFor(() => {
      expect(screen.getAllByTestId('feed-row')).toHaveLength(60);
    });
  });

  it('loads the next page from the footer button and stops on the last one', async () => {
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

  it('shows the seeded heart and comment counts and my pressed state', async () => {
    renderFeed(seeded());
    const rows = await screen.findAllByTestId('feed-row');
    const hearted = rows.find((row) => within(row).getByTestId('feed-heart').getAttribute('aria-pressed') === 'true');
    expect(hearted).toBeDefined();
    const count = Number(within(hearted!).getByTestId('feed-heart-count').textContent);
    expect(count).toBeGreaterThan(0);
    // The count is inside the button, where the label would silence it — so the name carries it.
    expect(within(hearted!).getByTestId('feed-heart')).toHaveAccessibleName(
      expect.stringContaining(String(count)),
    );
    const commented = rows.find((row) => within(row).queryByTestId('feed-comment-count'));
    expect(commented).toBeDefined();
  });

  it('a tap flips the heart at once and the mock keeps it', async () => {
    const api = seeded();
    renderFeed(api);
    const rows = await screen.findAllByTestId('feed-row');
    const row = rows.find((r) => within(r).getByTestId('feed-heart').getAttribute('aria-pressed') === 'false')!;
    const button = within(row).getByTestId('feed-heart');
    const before = Number(within(row).queryByTestId('feed-heart-count')?.textContent ?? '0');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(within(row).getByTestId('feed-heart-count')).toHaveTextContent(String(before + 1));

    await waitFor(() => expect(api.seed.hearts.some((h) => h.entryId === row.getAttribute('data-entry-id') && h.userId === api.seed.me.id)).toBe(true));
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('rolls the heart back and shows a banner when the request fails', async () => {
    const api = seeded();
    vi.spyOn(api, 'heartEntry').mockRejectedValue(new TypeError('offline'));
    renderFeed(api);
    const rows = await screen.findAllByTestId('feed-row');
    const row = rows.find((r) => within(r).getByTestId('feed-heart').getAttribute('aria-pressed') === 'false')!;
    const button = within(row).getByTestId('feed-heart');
    await userEvent.click(button);
    await screen.findByTestId('feed-heart-error');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers "Sửa" only on my own rows and opens the edit sheet with the title prefilled', async () => {
    const api = seeded();
    const mine = api.seed.entries.find((e) => e.status === 'confirmed' && e.userId === api.seed.me.id)!;
    mine.title = 'Chạy bộ tối';
    renderFeed(api, api.seed.me.id);
    const rows = await screen.findAllByTestId('feed-row');
    const myRow = rows.find((r) => r.getAttribute('data-entry-id') === mine.id)!;
    const theirRow = rows.find((r) => r.getAttribute('data-entry-id') !== mine.id && !within(r).queryByTestId('feed-edit'))!;
    expect(theirRow).toBeDefined();

    await userEvent.click(within(myRow).getByTestId('feed-edit'));
    const sheet = await screen.findByTestId('verdict-sheet');
    expect(within(sheet).getByTestId('verdict-title')).toHaveValue('Chạy bộ tối');
  });

  it('renders no "Sửa" at all without a signed-in id', async () => {
    renderFeed(seeded());
    await screen.findAllByTestId('feed-row');
    expect(screen.queryByTestId('feed-edit')).not.toBeInTheDocument();
  });
});
