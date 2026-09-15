import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { UserDto } from '@skinny/api-client';
import { ApiError } from '@/lib/api';
import { LOCALE_STORAGE_KEY } from '@/i18n/locale';
import { screen, waitFor } from '@/test/intl';
import { makeUser, renderApp, stubApi, stubAuthPort } from '@/test/session';

/** The sign-in wordmark is `auth.wordmark`, rendered across two lines; roles normalise the break. */
const WORDMARK = /Operation\s+Skinny Legend/;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('SessionProvider routing', () => {
  it('leaves a signed-out browser on the sign-in screen', async () => {
    const auth = stubAuthPort(false);
    renderApp({ auth, client: stubApi({ session: () => Promise.reject(new Error('unreachable')) }) });

    expect(await screen.findByRole('heading', { level: 1, name: WORDMARK })).toBeVisible();
    expect(screen.getByRole('button', { name: /Google/ })).toBeVisible();
  });

  it('routes an active session into the shell', async () => {
    const auth = stubAuthPort();
    renderApp({ auth, client: stubApi({ session: () => Promise.resolve(makeUser()) }) });

    expect(await screen.findByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  });

  it('routes a pending account to the waiting-for-approval screen', async () => {
    const auth = stubAuthPort();
    renderApp({
      auth,
      client: stubApi({ session: () => Promise.resolve(makeUser({ status: 'pending' })) }),
    });

    expect(await screen.findByText('Tài khoản đang chờ duyệt.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeVisible();
  });

  it('routes a `status: disabled` body to the disabled screen', async () => {
    const auth = stubAuthPort();
    renderApp({
      auth,
      client: stubApi({ session: () => Promise.resolve(makeUser({ status: 'disabled' })) }),
    });

    expect(await screen.findByText('Tài khoản đã bị khoá')).toBeVisible();
  });

  it('routes a 403 `disabled` with no body to the disabled screen too', async () => {
    const auth = stubAuthPort();
    renderApp({
      auth,
      client: stubApi({
        session: () => Promise.reject(new ApiError(403, 'disabled', 'Account disabled')),
      }),
    });

    expect(await screen.findByText('Tài khoản đã bị khoá')).toBeVisible();
  });

  it('signs out on a 401 rather than showing an error', async () => {
    const auth = stubAuthPort();
    renderApp({
      auth,
      client: stubApi({
        session: () => Promise.reject(new ApiError(401, 'unauthenticated', 'No token')),
      }),
    });

    expect(await screen.findByRole('heading', { level: 1, name: WORDMARK })).toBeVisible();
    await waitFor(() => expect(auth.signOutCalls).toBe(1));
  });

  it('surfaces a failed fetch as the offline error with a retry', async () => {
    const auth = stubAuthPort();
    let attempts = 0;
    renderApp({
      auth,
      client: stubApi({
        session: () => {
          attempts += 1;
          return Promise.reject(new TypeError('Failed to fetch'));
        },
        me: () => Promise.resolve(makeUser()),
      }),
    });

    expect(
      await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'),
    ).toBeVisible();
    expect(attempts).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  });

  it('sends the member back to the sign-in screen when Firebase signs them out', async () => {
    const auth = stubAuthPort();
    renderApp({ auth, client: stubApi({ session: () => Promise.resolve(makeUser()) }) });
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });

    auth.emit(false);
    expect(await screen.findByRole('heading', { level: 1, name: WORDMARK })).toBeVisible();
  });
});

describe('locale reconciliation on every session load (ruling R18)', () => {
  it('pushes an explicit local choice the server disagrees with', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const patches: string[] = [];
    renderApp({
      auth: stubAuthPort(),
      client: stubApi({
        session: () => Promise.resolve(makeUser({ locale: 'vi' })),
        updateMe: (patch: { locale?: string }) => {
          patches.push(patch.locale ?? '');
          return Promise.resolve(makeUser({ locale: 'en' }));
        },
      }),
    });

    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await waitFor(() => expect(patches).toEqual(['en']));
  });

  it('adopts the server value for a stored "system" without pushing', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'system');
    const updateMe = vi.fn<() => Promise<UserDto>>();
    renderApp({
      auth: stubAuthPort(),
      client: stubApi({
        session: () => Promise.resolve(makeUser({ locale: 'en' })),
        updateMe,
      }),
    });

    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    await waitFor(() => expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en'));
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('pushes the device language on a fresh install and keeps following the browser', async () => {
    // No `skinny.locale` key at all — ruling R18's definition of a fresh install.
    const patches: string[] = [];
    renderApp({
      auth: stubAuthPort(),
      client: stubApi({
        session: () => Promise.resolve(makeUser({ locale: 'en' })),
        updateMe: (patch: { locale?: string }) => {
          patches.push(patch.locale ?? '');
          return Promise.resolve(makeUser({ locale: 'vi' }));
        },
      }),
    });

    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    // jsdom's `navigator.language` is `en-US`, so the device resolves to `en`.
    await waitFor(() => expect(patches).toEqual(['en']));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('system');
  });

  it('does not take the session down when the PATCH fails', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    renderApp({
      auth: stubAuthPort(),
      client: stubApi({
        session: () => Promise.resolve(makeUser({ locale: 'vi' })),
        updateMe: () => Promise.reject(new ApiError(500, 'internal', 'boom')),
      }),
    });

    expect(await screen.findByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  });
});
