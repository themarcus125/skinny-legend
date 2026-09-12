import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { Providers } from './providers';
import { readLocale } from '@/i18n/locale.server';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  axes: ['opsz'],
  variable: '--font-inter',
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
    <html lang={locale} className={inter.variable}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
