import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen } from '@/test/intl';
import { makeUser, renderApp, stubApi, stubAuthPort } from '@/test/session';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeProvider } from './theme-provider';

const root = () => document.documentElement;

/**
 * `/sign-in` is outside `<AppShell/>`, which is exactly why this regression was possible. Since
 * Task 6 every route also sits under `<SessionGate/>`, so the real session has to be driven:
 * signed out for `/sign-in`, active for a shelled route.
 */
function renderRoute(path: string, signedIn = false) {
  return renderApp({
    path,
    auth: stubAuthPort(signedIn),
    client: stubApi({ session: () => Promise.resolve(makeUser()) }),
    outer: (children) => <ThemeProvider>{children}</ThemeProvider>,
  });
}

function stubPrefersDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => {
  root().className = '';
  root().style.colorScheme = '';
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeProvider at the root', () => {
  it('applies .dark on /sign-in, which lives outside the shell', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderRoute('/sign-in');

    expect(await screen.findByRole('heading', { level: 1, name: /Skinny Legend/ })).toBeVisible();
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().style.colorScheme).toBe('dark');
  });

  it('leaves /sign-in light when the stored choice is light', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderRoute('/sign-in');

    await screen.findByRole('heading', { level: 1 });
    expect(root().classList.contains('dark')).toBe(false);
    expect(root().style.colorScheme).toBe('light');
  });

  it('follows prefers-color-scheme on /sign-in with no stored override', async () => {
    stubPrefersDark(true);
    renderRoute('/sign-in');

    await screen.findByRole('heading', { level: 1 });
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('still themes a shelled route', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderRoute('/account', true);

    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    expect(root().classList.contains('dark')).toBe(true);
  });
});
