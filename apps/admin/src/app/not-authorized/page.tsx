import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SignOutButton } from '@/components/sign-out-button';

// A synchronous Server Component: next-intl's `useTranslations` works here without 'use client'.
export default function NotAuthorizedPage() {
  const t = useTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-8 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 shadow-raised">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{t('auth.notAuthorized')}</h1>
        <p className="text-base text-muted-foreground">
          {t.rich('auth.notAuthorizedHint', { code: (chunks) => <code>{chunks}</code> })}
        </p>
        <Link href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring text-sm font-medium text-brand-fg underline-offset-4 hover:underline">
          {t('common.retry')}
        </Link>
        <SignOutButton />
      </div>
    </main>
  );
}
