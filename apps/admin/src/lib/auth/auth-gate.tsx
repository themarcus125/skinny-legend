'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SignInCard } from '@/components/sign-in-card';
import { useAuth } from './auth-context';
import { gateDecision } from './gate-decision';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, error } = useAuth();
  const router = useRouter();
  const decision = gateDecision({ status, user, error });

  useEffect(() => {
    if (decision.kind === 'not-authorized') router.replace('/not-authorized');
  }, [decision.kind, router]);

  if (decision.kind === 'loading') {
    return <p className="p-8 text-sm text-muted-foreground">Đang tải…</p>;
  }
  if (decision.kind === 'sign-in') return <SignInCard />;
  if (decision.kind === 'error') return <SignInCard error={decision.message} />;
  if (decision.kind === 'not-authorized') return null;
  return <>{children}</>;
}
