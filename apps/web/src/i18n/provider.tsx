import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  deviceLanguage,
  readLocaleChoice,
  resolveLocale,
  writeLocaleChoice,
  type Locale,
  type LocaleChoice,
} from './locale';

/** Both catalogs are ~6 KB; a dynamic import would buy a flash of untranslated shell. */
export const MESSAGES = { vi, en } as const;

/** The challenge is run out of Ho Chi Minh City; every day boundary on the wire is local to it. */
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface LocaleContextValue {
  /** What the member picked: `'system'`, `'vi'` or `'en'`. */
  choice: LocaleChoice;
  /** What `choice` resolves to right now — the catalog actually rendering. */
  locale: Locale;
  setChoice: (choice: LocaleChoice) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Wraps use-intl's `IntlProvider` with the resolved catalog and keeps `<html lang>` honest, so
 * assistive tech and Safari's translation prompt see the language the page is actually in.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<LocaleChoice>(() => readLocaleChoice());
  const locale = resolveLocale(choice, deviceLanguage());

  const setChoice = useCallback((next: LocaleChoice) => {
    writeLocaleChoice(next);
    setChoiceState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ choice, locale, setChoice }),
    [choice, locale, setChoice],
  );

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone={TIME_ZONE}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

/**
 * The context when there is one, `null` otherwise. `SessionProvider` reconciles the language on
 * every session load and has to work in a test tree that mounts no `LocaleProvider`; it falls
 * back to writing the stored choice directly.
 */
export function useOptionalLocaleChoice(): LocaleContextValue | null {
  return useContext(LocaleContext);
}

export function useLocaleChoice(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocaleChoice must be used inside <LocaleProvider>.');
  return value;
}
