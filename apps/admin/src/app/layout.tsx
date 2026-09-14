import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { Providers } from './providers';
import { readLocale } from '@/i18n/locale.server';

// Be Vietnam Pro carries the full `vietnamese` subset — Urbanist ships latin/latin-ext only and
// dropped diacritics. Static weights 400–800 cover the design system's scale; the h2's 650 falls
// to the nearest available face (700) under CSS font matching.
const beVietnamPro = Be_Vietnam_Pro({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin', 'vietnamese'],
  variable: '--font-be-vietnam-pro',
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
    <html lang={locale} className={beVietnamPro.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
