import type { Metadata } from 'next';
import { Urbanist } from 'next/font/google';
import { getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { Providers } from './providers';
import { readLocale } from '@/i18n/locale.server';

// Urbanist is a variable font: loading the whole wght axis covers the design system's 400–800
// (and the h2's 650, which a fixed weight list could not express). Google Fonts ships Urbanist
// with `latin` and `latin-ext` only — there is no `vietnamese` subset to ask for — so latin-ext
// carries the Vietnamese diacritics and the system stack below backs up anything it misses.
const urbanist = Urbanist({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-urbanist',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await readLocale();
  const messages = await getMessages();
  return (
    // suppressHydrationWarning: next-themes writes the `dark` class on <html> before paint.
    <html lang={locale} className={urbanist.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
