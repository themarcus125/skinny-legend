import type { ReactElement } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { IntlProvider, createTranslator } from 'use-intl';
import { MESSAGES, TIME_ZONE } from '@/i18n/provider';
import type { Locale } from '@/i18n/locale';

/**
 * Every component test renders under a forced locale. The default is `vi` — Vietnamese is the
 * source of truth, so that is what the assertions read. A caller-supplied `wrapper` (a router, a
 * QueryClientProvider) is composed inside the intl provider.
 *
 * The same shape as `apps/admin/src/test/intl.tsx`, over `use-intl` instead of `next-intl`.
 */
export function render(
  ui: ReactElement,
  { locale = 'vi', wrapper: Wrapper, ...options }: RenderOptions & { locale?: Locale } = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <IntlProvider locale={locale} messages={MESSAGES[locale]} timeZone={TIME_ZONE}>
        {Wrapper ? <Wrapper>{children}</Wrapper> : children}
      </IntlProvider>
    ),
    ...options,
  });
}

/** Explicit alias for call sites that want to spell out the wrapping. */
export const renderWithIntl = render;

/** A real translator over the catalog, for pure helpers that take `t` as an argument. */
export function translator(locale: Locale = 'vi') {
  return createTranslator({ locale, messages: MESSAGES[locale], timeZone: TIME_ZONE });
}

export * from '@testing-library/react';
