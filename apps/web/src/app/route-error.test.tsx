import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { render, screen } from '@/test/intl';
import {
  RELOAD_COOLDOWN_MS,
  RELOAD_STAMP_KEY,
  RouteError,
  autoReloadOnChunkError,
  isChunkLoadError,
  shouldAutoReload,
} from './route-error';

/**
 * The failure this screen exists for: after a deploy the claiming worker has cleaned the
 * precache, so the next `lazy()` import asks Pages for a hash that no longer exists.
 */
const chunkError = () =>
  new TypeError('Failed to fetch dynamically imported module: /assets/trends-abc123.js');

afterEach(() => {
  sessionStorage.clear();
});

describe('isChunkLoadError', () => {
  it('recognises the message each engine uses for a failed dynamic import', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('nope'), { name: 'ChunkLoadError' }))).toBe(true);
  });

  it('leaves every other failure alone — a reload would not fix those', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new Response(null, { status: 404 }))).toBe(false);
    expect(isChunkLoadError('boom')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('shouldAutoReload', () => {
  const now = 1_700_000_000_000;

  it('reloads once for a chunk error', () => {
    expect(shouldAutoReload(chunkError(), null, now)).toBe(true);
  });

  it('does not reload again inside the cooldown — the reload did not help', () => {
    expect(shouldAutoReload(chunkError(), String(now - 1_000), now)).toBe(false);
  });

  it('is willing again once the cooldown has passed', () => {
    expect(shouldAutoReload(chunkError(), String(now - RELOAD_COOLDOWN_MS - 1), now)).toBe(true);
  });

  it('never reloads for an ordinary render error', () => {
    expect(shouldAutoReload(new Error('render failed'), null, now)).toBe(false);
  });
});

describe('autoReloadOnChunkError', () => {
  it('reloads and stamps the session, then holds off the second time', () => {
    const reload = vi.fn();
    expect(autoReloadOnChunkError(chunkError(), reload, 1_000)).toBe(true);
    expect(sessionStorage.getItem(RELOAD_STAMP_KEY)).toBe('1000');

    expect(autoReloadOnChunkError(chunkError(), reload, 2_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('RouteError', () => {
  /** The real router path: a route that throws lands on the root `errorElement`. */
  function renderThrowing(error: unknown) {
    const router = createMemoryRouter([
      {
        path: '/',
        errorElement: <RouteError />,
        loader: () => {
          throw error;
        },
        element: <div />,
      },
    ]);
    return render(<RouterProvider router={router} />);
  }

  it('shows branded, localised copy instead of the router default', async () => {
    renderThrowing(new Error('render failed'));

    expect(await screen.findByText('Cần tải lại ứng dụng')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại ngay' })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/i)).toBeNull();
  });

  it('leaves the stamp alone for an error a reload cannot fix', async () => {
    renderThrowing(new Error('render failed'));

    await screen.findByText('Cần tải lại ứng dụng');
    expect(sessionStorage.getItem(RELOAD_STAMP_KEY)).toBeNull();
  });

  it('reloads itself once when a lazy chunk has gone missing', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    renderThrowing(chunkError());

    await screen.findByText('Cần tải lại ứng dụng');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_STAMP_KEY)).not.toBeNull();
  });
});
