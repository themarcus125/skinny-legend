import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import type { PushAuthorizing, PushPermission, PushTokenSource } from '@/push/ports';
import { createPushRegistrar, type PushRegistrar } from '@/push/registrar';
import { render, screen, waitFor } from '@/test/intl';
import { RemindersRow } from './reminders-row';

/**
 * The four states the row can be in. The registrar is injected, so these are assertions about
 * what the member sees — the state machine itself is covered case for case in
 * `src/push/registrar.test.ts`.
 */

class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  get length(): number {
    return this.#map.size;
  }
  clear(): void {
    this.#map.clear();
  }
  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
}

function registrarFor(permission: PushPermission, granted = true): PushRegistrar {
  const authorizer: PushAuthorizing = {
    permission: () => Promise.resolve(permission === 'unsupported' ? 'denied' : permission),
    requestPermission: () => Promise.resolve(granted),
    isSupported: () => Promise.resolve(permission !== 'unsupported'),
  };
  const tokens: PushTokenSource = {
    currentToken: () => Promise.resolve('fcm-web-token'),
    deleteToken: () => Promise.resolve(),
  };
  return createPushRegistrar({
    api: makeApi(),
    authorizer,
    tokens,
    storage: new MemoryStorage(),
    locale: () => 'vi',
  });
}

function makeApi(): ApiClient {
  return createMockApiClient({ seed: makeSeed(), latencyMs: 0 });
}

function renderRow(registrar: PushRegistrar) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={makeApi()}>{children}</ApiProvider>
  );
  return { registrar, ...render(<RemindersRow registrar={registrar} />, { wrapper: Wrapper }) };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('the reminders row', () => {
  it('starts off, and turning it on registers the browser', async () => {
    const registrar = registrarFor('notDetermined');
    renderRow(registrar);

    const toggle = await screen.findByRole('switch', { name: 'Nhắc nhở' });
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('alert-banner')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
    expect(registrar.state.registeredToken).toBe('fcm-web-token');
  });

  it('shows the switch on, and turning it off unregisters the browser', async () => {
    const registrar = registrarFor('authorized');
    await registrar.enable();
    renderRow(registrar);

    const toggle = await screen.findByRole('switch', { name: 'Nhắc nhở' });
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
    expect(registrar.state.registeredToken).toBeNull();
  });

  it('explains a denied permission and disables the switch, with no "open settings" button', async () => {
    renderRow(registrarFor('denied'));

    const toggle = await screen.findByRole('switch', { name: 'Nhắc nhở' });
    await waitFor(() => {
      expect(toggle).toBeDisabled();
    });
    expect(await screen.findByTestId('alert-banner')).toHaveTextContent(
      /Trình duyệt đang chặn thông báo/,
    );
    // iOS's "Mở Cài đặt" has no web equivalent, so the row must not pretend otherwise.
    expect(screen.queryByRole('button', { name: 'Mở Cài đặt' })).not.toBeInTheDocument();
  });

  it('explains an unsupported browser and disables the switch', async () => {
    renderRow(registrarFor('unsupported'));

    const toggle = await screen.findByRole('switch', { name: 'Nhắc nhở' });
    await waitFor(() => {
      expect(toggle).toBeDisabled();
    });
    expect(await screen.findByTestId('alert-banner')).toHaveTextContent(
      /chưa hỗ trợ thông báo đẩy/,
    );
  });

  it('tells an uninstalled iOS Safari to add the app to the Home Screen', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    );
    renderRow(registrarFor('unsupported'));

    await screen.findByRole('switch', { name: 'Nhắc nhở' });
    expect(await screen.findByTestId('alert-banner-description')).toHaveTextContent(
      /Thêm vào MH chính/,
    );
  });
});
