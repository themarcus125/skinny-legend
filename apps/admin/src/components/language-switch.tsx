'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { GlobeIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCALE_COOKIE, LOCALES, parseLocale, type Locale } from '@/i18n/locale';
import { useAdminApi } from '@/lib/auth/auth-context';

/**
 * The sidebar language picker. Choosing a language writes the cookie (so the next server render
 * picks it up), tells the API (so the member's iOS app and push copy agree) and refreshes the
 * server tree so every `t()` re-renders in the new language.
 */
export function LanguageSwitch() {
  const t = useTranslations('nav');
  const active = parseLocale(useLocale());
  const router = useRouter();
  const api = useAdminApi();
  const [isPending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === active) return;
    // One year, site-wide: the cookie is the only place the dashboard's language lives.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Best effort — a failed PATCH must never strand the admin in the old language.
    void api.updateMe({ locale: next }).catch((error: unknown) => {
      console.warn('[locale] PATCH /me failed; the cookie still applies', error);
    });
    startTransition(() => router.refresh());
  };

  const items = Object.fromEntries(LOCALES.map((locale) => [locale, t(locale)])) as Record<Locale, string>;

  return (
    <div className="px-2 py-1.5">
      <Select items={items} value={active} onValueChange={(value: string | null) => choose(parseLocale(value ?? undefined))}>
        <SelectTrigger
          size="sm"
          aria-label={t('language')}
          disabled={isPending}
          className="w-full gap-2.5 border-transparent bg-transparent shadow-none text-secondary-foreground hover:bg-sidebar-accent"
        >
          <GlobeIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {items[locale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
