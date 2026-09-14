'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth/auth-context';
import type { Locale } from '@/i18n/locale';

export function Providers({
  children,
  locale,
  messages,
}: {
  children: ReactNode;
  locale: Locale;
  messages: AbstractIntlMessages;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* `theme` is persisted by next-themes under localStorage["skinny-admin-theme"]; the sidebar
          toggle writes it and `system` follows prefers-color-scheme until someone picks a side. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="skinny-admin-theme"
      >
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
          {/* richColors is what makes sonner read the semantic --success-bg / --error-bg … vars
              the Toaster maps onto the design system's soft fills. */}
          <Toaster richColors position="top-right" />
        </QueryClientProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
