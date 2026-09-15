import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ThemeProvider } from '@/app/theme-provider';
import { SessionProvider } from '@/auth/session';
import { LocaleProvider } from '@/i18n/provider';
import { ApiProvider } from '@/lib/api';
import { MOCK_OVERRIDE_KEY } from '@/lib/app-mode';
import { stubAuthPort, type StubAuth } from '@/test/session';
import { render, screen, waitFor, within } from '@/test/intl';
import { Account } from './account';

/**
 * The real mock client over the shared seed — the same data the iOS previews and the admin use —
 * so the header's rank and total are the seed's own numbers rather than a hand-written fixture.
 */
function makeApi(options: { historyPageSize?: number } = {}): ApiClient {
  return createMockApiClient({ seed: makeSeed(), latencyMs: 0, ...options });
}

function renderAccount(
  api: ApiClient = makeApi(),
  auth: StubAuth = stubAuthPort(),
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
              <MemoryRouter initialEntries={['/account']}>{children}</MemoryRouter>
            </ThemeProvider>
          </LocaleProvider>
        </SessionProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return { api, auth, ...render(<Account />, { wrapper: Wrapper }) };
}

beforeEach(() => {
  // jsdom's `navigator.language` is `en-US`, so a stored `"system"` would resolve the app to
  // English. Vietnamese is the source of truth and what these assertions read, so every test
  // starts from a browser that has chosen it — the language tests then change it.
  localStorage.setItem('skinny.locale', 'vi');
});

describe('the account screen', () => {
  it('shows my name, my rank and total, and the group-fund link', async () => {
    renderAccount();

    // The seed's own member row, through a real session load. `findByTestId` would resolve on
    // the *empty* span at first paint — the element exists before either round trip lands — so
    // the wait has to be on the content, not on the node.
    await waitFor(() => {
      expect(screen.getByTestId('account-name')).toHaveTextContent('Khoa');
    });
    // The seed's own numbers: rank 1..n and the season total for the row flagged `isMe`.
    await waitFor(() =>
      expect(screen.getByTestId('account-summary')).toHaveTextContent(/Hạng \d+ · \d+ điểm/),
    );
    expect(screen.getByRole('link', { name: 'Quỹ nhóm' })).toHaveAttribute(
      'href',
      'https://quy.momo.vn/v2/GZqk7REIhy?cover=f131',
    );
    expect(screen.getByRole('link', { name: 'Quỹ nhóm' })).toHaveAttribute(
      'rel',
      'noreferrer noopener',
    );
    expect(screen.getByTestId('app-version')).toHaveTextContent(/\d+\.\d+\.\d+/);
  });

  it('switching the language re-renders in English and PATCHes /me', async () => {
    const api = makeApi();
    const updateMe = vi.spyOn(api, 'updateMe');
    renderAccount(api);

    const picker = await screen.findByTestId('language-picker');
    await userEvent.click(within(picker).getByRole('radio', { name: 'English' }));

    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ locale: 'en' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('skinny.locale')).toBe('en');
  });

  it('choosing "Hệ thống" stores the choice, follows the device and PATCHes nothing', async () => {
    const api = makeApi();
    const updateMe = vi.spyOn(api, 'updateMe');
    renderAccount(api);

    const picker = await screen.findByTestId('language-picker');
    await userEvent.click(within(picker).getByRole('radio', { name: 'Hệ thống' }));

    expect(localStorage.getItem('skinny.locale')).toBe('system');
    // Spec §5: "follow this browser" is the weaker claim, so the server's explicit `vi` stands.
    // jsdom reports `en-US`, so the *display* follows the device immediately.
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('moves and selects through the language picker with the arrow keys', async () => {
    renderAccount();

    const picker = await screen.findByTestId('language-picker');
    const [system, vietnamese] = within(picker).getAllByRole('radio');
    // A roving tabindex: one Tab stop for the group, on the selected segment.
    expect(vietnamese).toHaveAttribute('tabindex', '0');
    expect(system).toHaveAttribute('tabindex', '-1');

    // The arrows are exercised on the appearance picker: moving the *language* re-renders the
    // whole catalog, so the assertion would be about translation rather than about the keyboard.
    const theme = screen.getByTestId('theme-picker');
    const [themeSystem, light] = within(theme).getAllByRole('radio');
    themeSystem!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(light).toHaveAttribute('aria-checked', 'true');
    expect(light).toHaveFocus();
    expect(localStorage.getItem('skinny.theme')).toBe('light');

    // …and they wrap at the ends.
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(within(theme).getAllByRole('radio')[2]).toHaveAttribute('aria-checked', 'true');
  });

  it('the theme override puts .dark on <html> and persists', async () => {
    renderAccount();

    const picker = await screen.findByTestId('theme-picker');
    await userEvent.click(within(picker).getByRole('radio', { name: 'Tối' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('skinny.theme')).toBe('dark');
  });

  it('sends feedback and shows a confirmation', async () => {
    const api = makeApi();
    const sendFeedback = vi.spyOn(api, 'sendFeedback');
    renderAccount(api);

    await userEvent.click(await screen.findByRole('button', { name: 'Gửi góp ý' }));
    await userEvent.type(screen.getByRole('textbox'), 'Ứng dụng rất tốt');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(sendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Ứng dụng rất tốt' }),
      ),
    );
    // The reminders row renders its own `role="status"` banner (jsdom has no push support), so
    // the confirmation is found by its copy rather than by being the only status on the screen.
    expect(await screen.findByText('Đã gửi góp ý')).toBeInTheDocument();
  });

  it('signs out only after the confirmation', async () => {
    const auth = stubAuthPort();
    renderAccount(makeApi(), auth);

    const row = await screen.findByTestId('sign-out-row');
    await userEvent.click(within(row).getByRole('button'));
    expect(auth.signOutCalls).toBe(0);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Đăng xuất khỏi Skinny Legend?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(auth.signOutCalls).toBe(1));
  });

  it('shows the sample-data exit only while the dev override is on', async () => {
    const { unmount } = renderAccount();
    expect(await screen.findByTestId('account-name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thoát dữ liệu mẫu' })).toBeNull();
    unmount();

    localStorage.setItem(MOCK_OVERRIDE_KEY, '1');
    renderAccount();
    expect(
      await screen.findByRole('button', { name: 'Thoát dữ liệu mẫu' }),
    ).toBeInTheDocument();
  });

  it('leaving sample data clears the override and reloads', async () => {
    localStorage.setItem(MOCK_OVERRIDE_KEY, '1');
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Thoát dữ liệu mẫu' }));

    expect(localStorage.getItem(MOCK_OVERRIDE_KEY)).toBeNull();
    expect(reload).toHaveBeenCalled();
  });
});
