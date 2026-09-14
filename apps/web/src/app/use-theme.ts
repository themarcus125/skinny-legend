import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  DARK_QUERY,
  applyTheme,
  prefersDark,
  readThemeChoice,
  writeThemeChoice,
  type ThemeChoice,
} from './theme';

export interface UseTheme {
  /** What the member picked in Account. */
  choice: ThemeChoice;
  /** What `choice` resolves to right now. */
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
}

function subscribeToColorScheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * Owns `.dark` on `<html>`: applies the stored choice on mount and re-applies it whenever the
 * choice changes or — while the choice is `'system'` — the browser's preference flips.
 *
 * The browser preference is read through `useSyncExternalStore` rather than mirrored into state,
 * so there is no render where React's idea of the scheme and the media query's disagree.
 */
export function useTheme(): UseTheme {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readThemeChoice());
  const systemDark = useSyncExternalStore(subscribeToColorScheme, prefersDark, () => false);

  useEffect(() => {
    applyTheme(choice, document.documentElement, systemDark);
  }, [choice, systemDark]);

  const setChoice = useCallback((next: ThemeChoice) => {
    writeThemeChoice(next);
    setChoiceState(next);
  }, []);

  return {
    choice,
    resolved: choice === 'system' ? (systemDark ? 'dark' : 'light') : choice,
    setChoice,
  };
}
