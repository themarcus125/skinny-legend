/**
 * The language preference, ported from `ios/SkinnyLegend/Core/Localization/AppLocale.swift`.
 *
 * `'system'` is stored locally so the app keeps following the browser; the *resolved* `vi`/`en`
 * value is what goes to the server in `PATCH /me { locale }`, because server-side copy (AI
 * reasons, push) needs a concrete language, not "whatever this browser is set to".
 *
 * Vietnamese is the source of truth, so anything the app does not ship falls back to `vi`.
 */
export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export type LocaleChoice = 'system' | Locale;
export const LOCALE_CHOICES = ['system', ...LOCALES] as const;

/** Not namespaced the way iOS's `@AppStorage` key is: an origin's localStorage is ours alone. */
export const LOCALE_STORAGE_KEY = 'skinny.locale';

/** `'system'` follows the browser (`navigator.language`); an explicit choice ignores it. */
export function resolveLocale(choice: LocaleChoice, deviceLanguage: string | undefined): Locale {
  if (choice === 'vi' || choice === 'en') return choice;
  return deviceLanguage?.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE;
}

export function isLocaleChoice(value: unknown): value is LocaleChoice {
  return typeof value === 'string' && (LOCALE_CHOICES as readonly string[]).includes(value);
}

/** The browser's preferred language, e.g. `'en-GB'`. `undefined` outside a browser. */
export function deviceLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language;
}

function safeStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  // Safari in private mode throws on `localStorage` access rather than returning null.
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readLocaleChoice(storage?: Storage): LocaleChoice {
  try {
    const raw = safeStorage(storage)?.getItem(LOCALE_STORAGE_KEY);
    return isLocaleChoice(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function writeLocaleChoice(choice: LocaleChoice, storage?: Storage): void {
  try {
    safeStorage(storage)?.setItem(LOCALE_STORAGE_KEY, choice);
  } catch {
    // A full or blocked quota must not take the language picker down with it.
  }
}

/**
 * Ruling R18 calls this a fresh install: no `skinny.locale` key at all. Task 6 uses it to decide
 * whether to push the device-resolved language to the server.
 */
export function isFreshInstall(storage?: Storage): boolean {
  try {
    return safeStorage(storage)?.getItem(LOCALE_STORAGE_KEY) == null;
  } catch {
    return true;
  }
}
