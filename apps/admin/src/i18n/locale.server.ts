import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale, type Locale } from './locale';

/**
 * Server-side read. Never import this from a client component.
 * Reading `cookies()` in the root layout deliberately makes every route dynamic — acceptable for
 * an auth-gated console whose pages are client-rendered anyway.
 */
export async function readLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
}
