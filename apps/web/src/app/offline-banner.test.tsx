import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@/test/intl';
import { OfflineBanner } from './offline-banner';

/** jsdom's `navigator.onLine` is a getter on the prototype, so it is redefined rather than set. */
function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    setOnline(true);
    render(<OfflineBanner />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows while navigator.onLine is false and hides on reconnect', async () => {
    setOnline(false);
    render(<OfflineBanner />);

    expect(await screen.findByRole('status')).toHaveTextContent('Đang ngoại tuyến');

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('comes back when the connection drops again', async () => {
    setOnline(true);
    render(<OfflineBanner />);

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Đang ngoại tuyến');
  });

  it('reads the English catalog under the English locale', async () => {
    setOnline(false);
    render(<OfflineBanner />, { locale: 'en' });

    expect(await screen.findByRole('status')).toHaveTextContent('Offline');
  });
});
