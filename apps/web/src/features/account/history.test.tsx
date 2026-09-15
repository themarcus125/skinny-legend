import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ThemeProvider } from '@/app/theme-provider';
import { openSheetCount } from '@/app/use-modal-sheet';
import { SessionProvider } from '@/auth/session';
import { LocaleProvider } from '@/i18n/provider';
import { ApiError } from '@/lib/live-client';
import { ApiProvider } from '@/lib/api';
import { stubAuthPort, type StubAuth } from '@/test/session';
import { render, screen, waitFor, within } from '@/test/intl';
import { AccountHistory } from './history';

/** The real mock client over the shared seed, so the rows and their points are the seed's own. */
function makeApi(options: { historyPageSize?: number } = {}): ApiClient {
  return createMockApiClient({ seed: makeSeed(), latencyMs: 0, ...options });
}

/**
 * The list on its own, under the providers Ghi nhận gives it. `pageSize` mirrors the mock's
 * `historyPageSize` so the paging test can ask for two rows a page and get exactly that.
 */
function renderAccount(
  api: ApiClient = makeApi(),
  auth: StubAuth = stubAuthPort(),
  pageSize?: number,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <SessionProvider auth={auth}>
          <LocaleProvider>
            <ThemeProvider>
              <MemoryRouter initialEntries={['/track']}>{children}</MemoryRouter>
            </ThemeProvider>
          </LocaleProvider>
        </SessionProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return { api, auth, ...render(<AccountHistory pageSize={pageSize} />, { wrapper: Wrapper }) };
}

beforeEach(() => {
  localStorage.setItem('skinny.locale', 'vi');
});

describe('the activity history on Ghi nhận', () => {
  it('groups my history by day with each day’s points and each row’s own', async () => {
    renderAccount();

    const days = await screen.findAllByTestId('history-day');
    expect(days.length).toBeGreaterThan(0);
    const first = days[0]!;
    // Newest first, and the day header totals the rows underneath it.
    const rows = within(first).getAllByTestId('history-row');
    const rowPoints = within(first)
      .getAllByTestId('history-points')
      .map((node) => Number(node.textContent?.replace('+', '')));
    expect(rows.length).toBe(rowPoints.length);
    expect(within(first).getByTestId('history-day-points')).toHaveTextContent(
      `+${rowPoints.reduce((sum, points) => sum + points, 0)}`,
    );
  });

  it('opens the Track verdict sheet in edit mode from a tap on the row', async () => {
    renderAccount();

    const rows = await screen.findAllByTestId('history-row');
    // The whole row is the button; "Không đúng?" is only the cue inside it.
    const row = within(rows[0]!).getByRole('button', { name: /Không đúng\?/ });
    expect(row).toHaveTextContent('Không đúng?');
    await userEvent.click(row);

    const sheet = await screen.findByRole('dialog');
    // `.edit` mode has no fresh verdict, so the sheet titles itself "Sửa hoạt động" and says the
    // server will recount rather than showing a local projection (ruling 2).
    expect(sheet).toHaveTextContent('Sửa hoạt động');
    expect(sheet).toHaveTextContent('Điểm sẽ được máy chủ tính lại khi lưu.');
  });

  it('deletes an entry from the edit sheet, behind a confirmation', async () => {
    const api = makeApi();
    const deleteEntry = vi.spyOn(api, 'deleteEntry');
    renderAccount(api);

    const rows = await screen.findAllByTestId('history-row');
    const doomed = rows[0]!.getAttribute('data-entry-id');
    await userEvent.click(
      within(rows[0]!).getByRole('button', { name: /Không đúng\?/ }),
    );
    await userEvent.click(await screen.findByTestId('verdict-delete'));

    // The confirmation asks with the entry's own day, and nothing is sent until it is answered.
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(deleteEntry).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith(doomed));
    await waitFor(() =>
      expect(
        screen.queryAllByTestId('history-row').some((row) => row.getAttribute('data-entry-id') === doomed),
      ).toBe(false),
    );
  });

  it('surfaces a failed deletion', async () => {
    const api = makeApi();
    vi.spyOn(api, 'deleteEntry').mockRejectedValue(new ApiError(500, 'internal', 'boom'));
    renderAccount(api);

    const rows = await screen.findAllByTestId('history-row');
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Không đúng\?/ }));
    await userEvent.click(await screen.findByTestId('verdict-delete'));
    const dialog = await screen.findByTestId('confirm-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    // Visible, not merely mounted: the banner sits on the screen, so both modals have to be gone.
    expect(await screen.findByText('Không xoá được, hãy thử lại.')).toBeVisible();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.queryByTestId('verdict-sheet')).toBeNull();
  });

  it('closes only the confirmation when Escape is pressed over it', async () => {
    renderAccount();

    const rows = await screen.findAllByTestId('history-row');
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Không đúng\?/ }));
    await userEvent.click(await screen.findByTestId('verdict-delete'));
    expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument();

    // Nested modals: only the topmost one reacts, so one Escape is one dismissal.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.getByTestId('verdict-sheet')).toBeInTheDocument();

    // …and the sheet underneath is live again.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('verdict-sheet')).toBeNull();
    // The stack empties and the page scrolls again — a leaked entry would make every later sheet
    // in this document undismissable.
    expect(openSheetCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('pages the history from the footer button', async () => {
    renderAccount(makeApi({ historyPageSize: 2 }), undefined, 2);

    await screen.findAllByTestId('history-row');
    const before = screen.getAllByTestId('history-row').length;
    expect(screen.getByTestId('history-footer')).toHaveAttribute('data-has-more', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('history-row').length).toBeGreaterThan(before),
    );
  });


  it('opens on a short first page and offers the rest from the footer', async () => {
    renderAccount(makeApi(), undefined, 5);
    await screen.findAllByTestId('history-row');
    expect(screen.getAllByTestId('history-row').length).toBeLessThanOrEqual(5);
    expect(screen.getByTestId('history-footer')).toHaveAttribute('data-has-more', 'true');
  });
});
