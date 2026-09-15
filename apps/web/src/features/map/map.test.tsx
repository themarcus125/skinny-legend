import { useEffect, useRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import type { MapPinDto } from '@skinny/shared/wire';
import { ApiProvider } from '@/lib/api';
import { render, screen, waitFor, within } from '@/test/intl';

/**
 * Leaflet needs a real layout engine — it measures its container and paints tiles — so the map
 * is tested at the `react-leaflet` boundary instead: the stubs render the same tree as plain
 * DOM, which leaves everything this screen actually owns (clustering, marker anatomy, the
 * selection sheet, fit-once, refresh-without-reset) assertable in jsdom. The clustering itself
 * has its own unit tests in `clusterer.test.ts`.
 */
const map = { invalidateSize: vi.fn(), fitBounds: vi.fn(), setView: vi.fn() };

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
  /*
   * Modelled on the real thing: the host element is Leaflet's `.leaflet-marker-icon`, which
   * owns `tabindex="0"` (its `keyboard: true` default) and holds the `divIcon`'s HTML as its
   * contents. `add` fires once the marker is on the map, handing the screen that element — so
   * the role and name the screen puts on it are read here from the same node a browser
   * exposes, rather than from a prop this stub invented.
   */
  Marker: ({
    icon,
    eventHandlers,
  }: {
    icon: { options: { html: string } };
    eventHandlers?: { add?: (event: { target: { getElement: () => HTMLElement | null } }) => void; click?: () => void };
  }) => {
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
      eventHandlers?.add?.({ target: { getElement: () => host.current } });
      // Mirrors Leaflet: `add` fires when the marker joins the map, not on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div
        ref={host}
        data-testid="map-marker"
        tabIndex={0}
        onClick={() => eventHandlers?.click?.()}
        dangerouslySetInnerHTML={{ __html: icon.options.html }}
      />
    );
  },
  useMap: () => map,
}));

const { MapScreen, canGoBack, clusterMarkerHtml, escapeHtml } = await import('./map');
const { PlaceButton } = await import('./place-button');
const { clusterPins, CLUSTER_RADIUS_M } = await import('./clusterer');

const pin = (id: string, lat: number, lng: number, name = 'Linh'): MapPinDto => ({
  entryId: id,
  lat,
  lng,
  placeName: 'Hồ bơi Lam Sơn',
  takenAt: '2026-09-10T00:00:00.000Z',
  localDate: '2026-09-10',
  categories: ['exercise'],
  thumbUrl: null,
  user: { id: `u-${id}`, displayName: name, avatarUrl: null },
});

/** Two pins 15 m apart (one cluster of two) and one 1.5 km away (a cluster of one). */
const PINS: MapPinDto[] = [
  pin('a', 10.77, 106.7),
  pin('a2', 10.7701, 106.7001, 'Minh'),
  pin('b', 10.78, 106.71, 'Trang'),
];

function stubApi(mapPins: () => Promise<MapPinDto[]>): ApiClient {
  return { mapPins: (_days: number) => mapPins() } as unknown as ApiClient;
}

function renderMap(api: ApiClient, entry?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter
          initialEntries={[entry ? `/feed/map?entry=${encodeURIComponent(entry)}` : '/feed/map']}
        >
          {children}
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<MapScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  map.invalidateSize.mockClear();
  map.fitBounds.mockClear();
  map.setView.mockClear();
});

describe('the group map', () => {
  it('draws one marker per cluster over OSM tiles, badging only the multi-pin ones', async () => {
    renderMap(stubApi(() => Promise.resolve(PINS)));

    const markers = await screen.findAllByTestId('map-marker');
    expect(markers).toHaveLength(clusterPins(PINS, CLUSTER_RADIUS_M).length);
    expect(markers).toHaveLength(2);

    // The newest pin of each cluster is the face, and only the cluster of two carries a count.
    expect(within(markers[0]!).getByTestId('cluster-avatar')).toHaveTextContent('L');
    expect(within(markers[0]!).getByTestId('cluster-count')).toHaveTextContent('2');
    expect(within(markers[1]!).queryByTestId('cluster-count')).not.toBeInTheDocument();

    /*
     * The name lands on the focusable marker element itself, not on anything inside the icon:
     * a generic element takes no name from its contents, so a label on a child would not name
     * it. The whole icon is `aria-hidden` beneath, so it never reads as "L 2" or twice over.
     * The wording is `ClusterPin.accessibilityLabel`'s: name, count, place.
     */
    expect(markers[0]).toHaveAttribute('role', 'button');
    expect(markers[0]).toHaveAccessibleName('Linh, 2 mục ghi, Hồ bơi Lam Sơn');
    expect(markers[1]).toHaveAccessibleName('Trang, Hồ bơi Lam Sơn');
    expect(screen.getByRole('button', { name: 'Linh, 2 mục ghi, Hồ bơi Lam Sơn' })).toBe(
      markers[0],
    );
    expect(within(markers[0]!).getByTestId('cluster-avatar')).toHaveAttribute('aria-hidden', 'true');
    expect(within(markers[0]!).getByTestId('cluster-count')).toHaveAttribute('aria-hidden', 'true');

    const tiles = screen.getByTestId('tile-layer');
    expect(tiles).toHaveAttribute('data-url', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(tiles).toHaveAttribute('data-attribution', '© OpenStreetMap contributors');
  });

  it('opens one pin card for a single-pin marker and the whole list for a cluster', async () => {
    renderMap(stubApi(() => Promise.resolve(PINS)));
    const markers = await screen.findAllByTestId('map-marker');

    await userEvent.click(markers[1]!);
    expect(await screen.findByTestId('cluster-sheet')).toBeInTheDocument();
    expect(screen.getAllByTestId('pin-card')).toHaveLength(1);
    expect(screen.queryByTestId('cluster-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('pin-name')).toHaveTextContent('Trang');
    expect(screen.getByTestId('pin-place')).toHaveTextContent('Hồ bơi Lam Sơn');
    expect(screen.getByTestId('pin-day')).toHaveTextContent('Thứ Năm, 10/09');

    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByTestId('cluster-sheet')).not.toBeInTheDocument();

    await userEvent.click(markers[0]!);
    expect(await screen.findByTestId('cluster-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('pin-card')).toHaveLength(2);
  });

  it('fits the bounds once and never again, refresh included', async () => {
    let calls = 0;
    renderMap(
      stubApi(() => {
        calls += 1;
        return Promise.resolve(PINS);
      }),
    );
    await screen.findAllByTestId('map-marker');
    await waitFor(() => {
      expect(map.fitBounds).toHaveBeenCalledTimes(1);
    });
    // Size first, or fitBounds computes its zoom against a 0×0 container and overzooms.
    expect(map.invalidateSize).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => {
      expect(calls).toBe(2);
    });
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('refetches without ever falling back to the skeleton once pins have landed', async () => {
    let resolveSecond: ((pins: MapPinDto[]) => void) | undefined;
    let calls = 0;
    renderMap(
      stubApi(() => {
        calls += 1;
        if (calls === 1) return Promise.resolve(PINS);
        return new Promise<MapPinDto[]>((resolve) => {
          resolveSecond = resolve;
        });
      }),
    );
    await screen.findAllByTestId('map-marker');

    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => {
      expect(calls).toBe(2);
    });
    // The in-flight refetch keeps the map mounted with the pins it already has.
    expect(screen.queryByTestId('map-skeleton')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2);

    resolveSecond?.([PINS[2]!]);
    await waitFor(() => {
      expect(screen.getAllByTestId('map-marker')).toHaveLength(1);
    });
  });

  it('is modal: focus moves in, is trapped, the page locks and focus comes back', async () => {
    renderMap(stubApi(() => Promise.resolve(PINS)));
    const markers = await screen.findAllByTestId('map-marker');
    const opener = markers[0]!;
    opener.focus();

    await userEvent.click(markers[0]!);
    const sheet = await screen.findByTestId('cluster-sheet');
    expect(document.activeElement).toBe(sheet);
    expect(document.body).toHaveStyle({ overflow: 'hidden' });

    // Tab off the last control inside the panel wraps to the first, never out to the map.
    const inside = within(sheet).getAllByRole('button');
    const first = inside[0]!;
    const last = inside[inside.length - 1]!;
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('cluster-sheet')).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
  });

  it('shows the catalog empty state when nobody has shared a place', async () => {
    renderMap(stubApi(() => Promise.resolve([])));
    expect(await screen.findByText('Chưa có địa điểm nào được chia sẻ.')).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('reports a failure through the alert banner with a retry', async () => {
    let calls = 0;
    renderMap(
      stubApi(() => {
        calls += 1;
        return Promise.reject(new Error('boom'));
      }),
    );
    expect(await screen.findByText('Không tải được bản đồ.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => {
      expect(calls).toBeGreaterThan(1);
    });
  });

  /**
   * SKI-134: the map is no longer reached from a toolbar button over the feed but from a
   * location on a row, which hands the entry id over in `?entry=`.
   */
  it('centres on the entry from the search param and opens its card, keeping the other pins', async () => {
    renderMap(stubApi(() => Promise.resolve(PINS)), 'b');

    // The sheet opens by itself on the cluster holding that entry.
    const sheet = await screen.findByTestId('cluster-sheet');
    expect(within(sheet).getByTestId('pin-card')).toHaveAttribute('data-entry-id', 'b');
    expect(within(sheet).getByTestId('pin-name')).toHaveTextContent('Trang');

    // Centred on it rather than fitted to everything — and every other pin is still drawn.
    await waitFor(() => {
      expect(map.setView).toHaveBeenCalledTimes(1);
    });
    expect(map.setView.mock.calls[0]![0]).toEqual([10.78, 106.71]);
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2);

    // One-shot: dismissing it is final, and a refetch must not shove it back up.
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByTestId('cluster-sheet')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('map-marker')).toHaveLength(2);
    });
    expect(screen.queryByTestId('cluster-sheet')).not.toBeInTheDocument();
  });

  it('opens the whole cluster when the entry shares a place with others', async () => {
    renderMap(stubApi(() => Promise.resolve(PINS)), 'a2');

    const sheet = await screen.findByTestId('cluster-sheet');
    expect(within(sheet).getByTestId('cluster-list')).toBeInTheDocument();
    const cards = within(sheet).getAllByTestId('pin-card');
    expect(cards.map((card) => card.getAttribute('data-entry-id'))).toContain('a2');
  });

  it('ignores an entry id the map does not know and fits every pin as usual', async () => {
    renderMap(stubApi(() => Promise.resolve(PINS)), 'nope');

    await screen.findAllByTestId('map-marker');
    await waitFor(() => {
      expect(map.fitBounds).toHaveBeenCalledTimes(1);
    });
    expect(map.setView).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cluster-sheet')).not.toBeInTheDocument();
  });

  it('escapes member-supplied text before it reaches the divIcon HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    // The initials are the only member-supplied thing interpolated into HTML; the label goes on
    // the marker element through `setAttribute`, which takes it as data.
    const html = clusterMarkerHtml({
      id: 'x',
      center: { lat: 0, lng: 0 },
      pins: [pin('x', 0, 0, '<script>')],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;');
  });
});

/**
 * SKI-134 review: the map is reached from a location on Trang chủ *and* from one in a member's
 * history, so "Quay lại" cannot hardcode a destination — it has to undo the step that got here.
 */
describe('the map back button', () => {
  it('goes back when the screen was pushed, and home when it was not', () => {
    expect(canGoBack('PUSH', null)).toBe(true);
    expect(canGoBack('REPLACE', null)).toBe(true);
    // A cold landing: a deep link, a reload, a pasted address.
    expect(canGoBack('POP', null)).toBe(false);
    expect(canGoBack('POP', {})).toBe(false);
    expect(canGoBack('POP', { idx: 0 })).toBe(false);
    // React Router stamps `idx`; anything past 0 is a step of ours to return to.
    expect(canGoBack('POP', { idx: 2 })).toBe(true);
    expect(canGoBack('POP', { idx: 'two' })).toBe(false);
  });

  function renderRouted(initial: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Here = () => <span data-testid="here">{useLocation().pathname}</span>;
    return render(
      <QueryClientProvider client={queryClient}>
        <ApiProvider client={stubApi(() => Promise.resolve(PINS))}>
          <MemoryRouter initialEntries={[initial]}>
            <Here />
            <Routes>
              <Route
                path="/leaderboard/:userId"
                element={<PlaceButton entryId="b" placeName="Hồ bơi Lam Sơn" testId="history-place" />}
              />
              <Route path="/" element={<span data-testid="home" />} />
              <Route path="/feed/map" element={<MapScreen />} />
            </Routes>
          </MemoryRouter>
        </ApiProvider>
      </QueryClientProvider>,
    );
  }

  it('returns to the member page the reader came from, not to Trang chủ', async () => {
    renderRouted('/leaderboard/u1');
    await userEvent.click(screen.getByTestId('history-place'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bản đồ' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(screen.getByTestId('here')).toHaveTextContent('/leaderboard/u1');
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
  });

  it('falls back to Trang chủ when the map is the first screen of the session', async () => {
    renderRouted('/feed/map');
    await screen.findAllByTestId('map-marker');

    await userEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(screen.getByTestId('here')).toHaveTextContent('/');
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });
});
