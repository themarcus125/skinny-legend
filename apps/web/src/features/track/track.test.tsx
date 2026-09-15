import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import { fireEvent, render, screen, waitFor, within } from '@/test/intl';
import { Track } from './track';

/** The fixed day the whole plan pins its fixtures to. */
const SEED_DAY = '2026-09-14';

/**
 * The same JPEG the Playwright spec uploads: EXIF GPS on top of the seed's
 * "Phòng gym California Fitness", so the place list has exactly one name to offer.
 */
const FIXTURE = readFileSync(resolve(process.cwd(), 'e2e/fixtures/entry.jpg'));
const photo = () => new File([new Uint8Array(FIXTURE)], 'entry.jpg', { type: 'image/jpeg' });

function renderTrack(api: ApiClient) {
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
  return { queryClient, ...render(<Track />, { wrapper: Wrapper }) };
}

/** Drops a file on one of the two hidden inputs, the way the browser would. */
function pick(testId: 'camera-input' | 'library-input') {
  fireEvent.change(screen.getByTestId(testId), { target: { files: [photo()] } });
}

beforeEach(() => {
  // jsdom has no object-URL store; the preview only needs a string it can hand an <img>.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Track screen', () => {
  it('offers a camera capture and a library picker', () => {
    renderTrack(createMockApiClient({ seed: makeSeed(SEED_DAY) }));
    expect(screen.getByRole('button', { name: /Chụp ảnh/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thư viện/ })).toBeInTheDocument();
    // The rear camera, straight into the capture UI; the library input carries no `capture`.
    expect(screen.getByTestId('camera-input')).toHaveAttribute('capture', 'environment');
    expect(screen.getByTestId('library-input')).not.toHaveAttribute('capture');
  });

  it('uploads with a progress bar and opens the sheet on an AI-confirmed entry', async () => {
    renderTrack(createMockApiClient({ seed: makeSeed(SEED_DAY) }));
    pick('library-input');

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Đã ghi nhận' })).toBeInTheDocument();
    // Already tracked: the points are banked, and the primary only dismisses.
    expect(within(sheet).getByText('Điểm đã cộng')).toBeInTheDocument();
    expect(within(sheet).getByText('Đã tính vào tổng điểm của bạn.')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-primary')).toHaveTextContent('Xong');
  });

  it('"Xong" dismisses without a PATCH, celebrates once and refreshes the dashboard', async () => {
    const api = createMockApiClient({ seed: makeSeed(SEED_DAY) });
    const confirmEntry = vi.spyOn(api, 'confirmEntry');
    const { queryClient } = renderTrack(api);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    pick('library-input');

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('verdict-primary'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(confirmEntry).not.toHaveBeenCalled();
    expect(await screen.findByText(/Đã ghi nhận \+\d+ điểm!/)).toBeInTheDocument();
    const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['dashboard']));
    expect(keys).toContain(JSON.stringify(['feed']));
    expect(keys).toContain(JSON.stringify(['leaderboard']));
    expect(keys).toContain(JSON.stringify(['map']));
  });

  it('"Không đúng?" expands the chips and turns the primary into a save', async () => {
    renderTrack(createMockApiClient({ seed: makeSeed(SEED_DAY) }));
    pick('library-input');
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByTestId('toggle-editing'));
    const chips = screen.getAllByTestId('category-chip');
    expect(chips).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /Bữa ăn lành mạnh/ }));
    expect(screen.getByTestId('verdict-primary')).toHaveTextContent('Lưu thay đổi');
  });

  it('a failed verdict opens the picker with the confirm button disabled until a chip is picked', async () => {
    const api = createMockApiClient({ seed: makeSeed(SEED_DAY) });
    // The mock fails every fifth counter tick; the screen spends one on presign and one on
    // createEntry, so three warm-up presigns land createEntry exactly on the failing fixture.
    for (let i = 0; i < 3; i += 1) await api.presign({ kind: 'photo', contentType: 'image/jpeg' });
    renderTrack(api);
    pick('camera-input');

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Chọn hoạt động' })).toBeInTheDocument();
    expect(within(sheet).getByText('Không nhận diện được ảnh')).toBeInTheDocument();
    // Nothing selected: the server requires ≥ 1 category, so the save is never offered.
    const primary = screen.getByTestId('verdict-primary');
    expect(primary).toHaveTextContent('Xác nhận');
    expect(primary).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Tập luyện/ }));
    expect(primary).toBeEnabled();
  });

  it('a place picked from the nearby list is PATCHed with placeSource osm', async () => {
    const api = createMockApiClient({ seed: makeSeed(SEED_DAY) });
    const confirmEntry = vi.spyOn(api, 'confirmEntry');
    renderTrack(api);
    pick('library-input');
    await screen.findByRole('dialog');

    // The fixture's EXIF GPS sits on the seed's gym, so exactly one name comes back.
    const option = await screen.findByTestId('place-option');
    expect(option).toHaveTextContent('Phòng gym California Fitness');
    fireEvent.click(option);

    const primary = screen.getByTestId('verdict-primary');
    expect(primary).toHaveTextContent('Lưu thay đổi');
    fireEvent.click(primary);

    await waitFor(() => expect(confirmEntry).toHaveBeenCalled());
    expect(confirmEntry.mock.calls[0]?.[1]).toMatchObject({
      placeName: 'Phòng gym California Fitness',
      placeSource: 'osm',
    });
  });

  it('surfaces an upload failure as the catalog error and keeps the screen usable', async () => {
    const api = createMockApiClient({ seed: makeSeed(SEED_DAY) });
    vi.spyOn(api, 'uploadToPresign').mockRejectedValue(
      Object.assign(new Error('nope'), { name: 'TypeError' }),
    );
    renderTrack(api);
    pick('library-input');

    expect(await screen.findByText('Không phân tích được ảnh, hãy thử lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chụp ảnh/ })).toBeEnabled();
  });
});
