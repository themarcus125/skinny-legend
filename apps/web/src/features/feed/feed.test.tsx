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

function renderFeed(api: ApiClient) {
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
  return render(<FeedSection />, { wrapper: Wrapper });
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

    // The map is reached from a location now, never from a toolbar button over the feed.
    expect(screen.queryByRole('link', { name: 'Bản đồ' })).not.toBeInTheDocument();
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
    // The photo is a button (it opens the viewer); nothing else in the row may be.
    const buttons = screen.queryAllByRole('button').filter((b) => b.getAttribute('data-testid') !== 'photo-button');
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
});
