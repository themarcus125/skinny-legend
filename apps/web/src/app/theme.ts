/**
 * Dark mode: `prefers-color-scheme` with an Account override persisted locally — the same
 * semantics as the admin's `next-themes` setup (`attribute="class"`, `enableSystem`), minus the
 * dependency. `.dark` lands on `<html>`, which is what `@custom-variant dark` in `index.css`
 * matches, and `color-scheme` follows so form controls and scrollbars flip too.
 */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_STORAGE_KEY = 'skinny.theme';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

function safeStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readThemeChoice(storage?: Storage): ThemeChoice {
  try {
    const raw = safeStorage(storage)?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemeChoice(choice: ThemeChoice, storage?: Storage): void {
  try {
    safeStorage(storage)?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Never let a blocked quota take the appearance picker down.
  }
}

/** `prefersDark` is injected rather than read here so the function stays pure and testable. */
export function applyTheme(choice: ThemeChoice, root: HTMLElement, prefersDark: boolean): void {
  const dark = choice === 'dark' || (choice === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/** True when the browser currently prefers dark. False wherever `matchMedia` is missing. */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DARK_QUERY).matches;
}
