import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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
const map = { invalidateSize: vi.fn(), fitBounds: vi.fn() };

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
  /*
   * The stub renders the icon's own HTML and nothing else, so the tests read exactly the
   * attributes a browser exposes — the `aria-label` the divIcon carries. Mapping the `alt`
   * prop onto something here would assert a contract Leaflet 1.9 does not honour for a
   * `divIcon` (it applies `alt` to IMG icons only).
   */
  Marker: ({
    icon,
    eventHandlers,
  }: {
    icon: { options: { html: string } };
    eventHandlers?: { click?: () => void };
  }) => (
    <div
      data-testid="map-marker"
      // Leaflet's own `keyboard: true` default puts `tabindex="0"` on `.leaflet-marker-icon`,
      // so the marker element is the focus target the sheet has to hand focus back to.
      tabIndex={0}
      onClick={() => eventHandlers?.click?.()}
      dangerouslySetInnerHTML={{ __html: icon.options.html }}
    />
  ),
  useMap: () => map,
}));

const { MapScreen, clusterMarkerHtml, escapeHtml } = await import('./map');
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

function renderMap(api: ApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <MemoryRouter initialEntries={['/feed/map']}>{children}</MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );
  return render(<MapScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  map.invalidateSize.mockClear();
  map.fitBounds.mockClear();
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

    // The marker reads as one button — iOS's `.accessibilityElement(children: .combine)` —
    // labelled the way `ClusterPin.accessibilityLabel` composes it: name, count, place. The
    // initials and the count are hidden beneath it so it is not read as "L 2".
    expect(within(markers[0]!).getByRole('button')).toHaveAccessibleName(
      'Linh, 2 mục ghi, Hồ bơi Lam Sơn',
    );
    expect(within(markers[1]!).getByRole('button')).toHaveAccessibleName(
      'Trang, Hồ bơi Lam Sơn',
    );
    expect(within(markers[0]!).getByTestId('cluster-avatar')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(within(markers[0]!).getByTestId('cluster-count')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

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

  it('escapes member-supplied text before it reaches the divIcon HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    const html = clusterMarkerHtml(
      { id: 'x', center: { lat: 0, lng: 0 }, pins: [pin('x', 0, 0, '<script>')] },
      '<script>alert(1)</script>, Hồ bơi "Lam Sơn"',
    );
    // Both seams: the initials in the body and the composed name in the aria-label.
    expect(html).not.toContain('<script>');
    expect(html).toContain('aria-label="&lt;script&gt;alert(1)&lt;/script&gt;, Hồ bơi &quot;Lam Sơn&quot;"');
  });
});
