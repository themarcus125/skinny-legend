import type { ReactElement } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import type { Locale } from '@/i18n/locale';

const MESSAGES = { vi, en } as const;

/**
 * Every component test renders under a forced locale. The default is `vi`, so the existing
 * Vietnamese assertions keep passing unchanged (spec §D: "Tests keep asserting Vietnamese").
 */
export function render(
  ui: ReactElement,
  { locale = 'vi' as Locale, ...options }: RenderOptions & { locale?: Locale } = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  });
}

/** Explicit alias for call sites that want to spell out the wrapping. */
export const renderWithIntl = render;

export * from '@testing-library/react';
