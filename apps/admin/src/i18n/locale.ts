import { cookies } from 'next/headers';

/** The only two languages the dashboard ships (spec §D). Vietnamese is the source of truth. */
export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

/**
 * The dashboard deliberately has NO i18n routing: no `[locale]` segment, no middleware rewrite,
 * every URL unchanged. The language lives in a plain cookie the sidebar switch writes.
 */
export const LOCALE_COOKIE = 'locale';

export function parseLocale(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}

/** Server-side read. Never import this from a client component. */
export async function readLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}
