import type { ReactElement } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider, type Messages } from 'next-intl';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import type { Locale } from '@/i18n/locale';

const MESSAGES = { vi, en } as const;

/**
 * Every component test renders under a forced locale. The default is `vi`, so the existing
 * Vietnamese assertions keep passing unchanged (spec §D: "Tests keep asserting Vietnamese").
 * A caller-supplied `wrapper` (e.g. a QueryClientProvider) is composed inside the intl provider.
 */
export function render(
  ui: ReactElement,
  { locale = 'vi' as Locale, wrapper: Wrapper, ...options }: RenderOptions & { locale?: Locale } = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {Wrapper ? <Wrapper>{children}</Wrapper> : children}
      </NextIntlClientProvider>
    ),
    ...options,
  });
}

/** Explicit alias for call sites that want to spell out the wrapping. */
export const renderWithIntl = render;

/**
 * A real translator over the catalogue, for pure helpers that take `t` as an argument. Typed with
 * the same untyped `Messages` the app's `useTranslations()` uses, so it accepts string keys.
 */
export function translator(locale: Locale = 'vi') {
  return createTranslator({ locale, messages: MESSAGES[locale] as Messages });
}

export * from '@testing-library/react';
