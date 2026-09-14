import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { Providers } from './providers';
import { readLocale } from '@/i18n/locale.server';

// Be Vietnam Pro carries the full `vietnamese` subset — Urbanist ships latin/latin-ext only and
// dropped diacritics. Static weights 400–800 cover the design system's scale; the h2's 650 falls
// to the nearest available face (700) under CSS font matching.
//
// The faces are self-hosted by `@skinny/ui/styles/fonts.css` (imported at the top of globals.css)
// rather than next/font/google, so the admin and apps/web — which has no Next font pipeline —
// ship byte-identical files. `--font-sans` in globals.css names the family directly, so there is
// no generated class to put on <html>.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await readLocale();
  const messages = await getMessages();
  return (
    // suppressHydrationWarning: next-themes writes the `dark` class on <html> before paint.
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
