import { USER_LOCALES, type UserLocale } from '@/lib/api/types';

/**
 * The only two languages the dashboard ships (spec §D). Vietnamese is the source of truth.
 * The UI locale IS the wire locale (`users.locale`): switching the dashboard also PATCHes /me.
 */
export const LOCALES = USER_LOCALES;
export type Locale = UserLocale;
export const DEFAULT_LOCALE: Locale = 'vi';

/**
 * The dashboard deliberately has NO i18n routing: no `[locale]` segment, no middleware rewrite,
 * every URL unchanged. The language lives in a plain cookie the sidebar switch writes.
 *
 * This module stays free of server-only imports so client components can use it; the cookie
 * read lives in `locale.server.ts`.
 */
export const LOCALE_COOKIE = 'locale';

export function parseLocale(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}
