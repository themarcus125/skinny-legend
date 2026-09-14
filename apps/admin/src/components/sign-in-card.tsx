'use client';

import { FlameIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/sign-out-button';
import { useAuth } from '@/lib/auth/auth-context';

/** `error` is already-translated copy (AuthGate resolves the message key). */
export function SignInCard({ error }: { error?: string }) {
  const t = useTranslations('auth');
  const { signIn, status, hasFirebaseUser } = useAuth();
  // A Firebase user can be signed in while the app still rejects them (disabled/pending
  // account, or any other /auth/session failure) — the "Sign in with Google" button won't
  // help since Firebase already considers them authenticated, so offer a clean way out instead.
  const isStuckSignedIn = status === 'error' && hasFirebaseUser;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-8">
      <Card className="w-full max-w-[380px] shadow-popover">
        <CardHeader className="items-center justify-items-center text-center">
          <span
            aria-hidden
            className="mb-3 flex size-12 items-center justify-center rounded-md bg-brand text-brand-foreground"
          >
            <FlameIcon className="size-5" />
          </span>
          <CardTitle className="type-h2">Skinny Legend Admin</CardTitle>
          <CardDescription className="text-base">{t('signInHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          {isStuckSignedIn ? (
            <SignOutButton className="w-full" />
          ) : (
            <Button size="lg" className="w-full" onClick={() => void signIn()}>
              {t('signInWithGoogle')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
