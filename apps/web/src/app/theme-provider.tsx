import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useTheme, type UseTheme } from './use-theme';

const ThemeContext = createContext<UseTheme | null>(null);

/**
 * Owns the appearance for the **whole** app.
 *
 * It lives above the router rather than inside `<AppShell/>`: `/sign-in` is deliberately outside
 * the shell (no tab bar while signed out), so a shell-level `useTheme()` never ran there and the
 * sign-in screen was stuck in light mode. Mounting the hook once at the root means every route —
 * shelled or not — gets `.dark` and `color-scheme`, and the Account picker re-renders all of it.
 *
 * `index.html` sets `.dark` before first paint from the same stored key; this provider is what
 * keeps it correct afterwards.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The appearance choice and its setter, for the Account picker (Task 13). */
export function useAppTheme(): UseTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme must be used inside <ThemeProvider>.');
  return theme;
}
