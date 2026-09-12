'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SignInCard } from '@/components/sign-in-card';
import { useAuth } from './auth-context';
import { gateDecision } from './gate-decision';

export function AuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { status, user, error } = useAuth();
  const router = useRouter();
  const decision = gateDecision({ status, user, error });

  useEffect(() => {
    if (decision.kind === 'not-authorized') router.replace('/not-authorized');
  }, [decision.kind, router]);

  if (decision.kind === 'loading') {
    return (
      <p className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</p>
    );
  }
  if (decision.kind === 'sign-in') return <SignInCard />;
  if (decision.kind === 'error') {
    // `message` is a catalogue key, except for the two build-time env errors, which are raw
    // developer text (see AuthState.error) and render as they are.
    return <SignInCard error={t.has(decision.message) ? t(decision.message) : decision.message} />;
  }
  if (decision.kind === 'not-authorized') return null;
  return <>{children}</>;
}
