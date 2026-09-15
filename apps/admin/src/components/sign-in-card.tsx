'use client';

import { FlameIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SignOutButton } from '@/components/sign-out-button';
import { useAuth } from '@/lib/auth/auth-context';
import { AUTH_EMULATOR_HOST, signInWithEmulatorPassword } from '@/lib/auth/firebase';

/** `error` is already-translated copy (AuthGate resolves the message key). */
export function SignInCard({ error }: { error?: string }) {
  const t = useTranslations('auth');
  const { signIn, status, hasFirebaseUser } = useAuth();
  // A Firebase user can be signed in while the app still rejects them (disabled/pending
  // account, or any other /auth/session failure) — the "Sign in with Google" button won't
  // help since Firebase already considers them authenticated, so offer a clean way out instead.
  const isStuckSignedIn = status === 'error' && hasFirebaseUser;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emulatorError, setEmulatorError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submitEmulator(event: FormEvent) {
    event.preventDefault();
    setEmulatorError(false);
    setBusy(true);
    try {
      await signInWithEmulatorPassword(email, password);
    } catch (err) {
      console.error('[auth] emulator sign-in failed', err);
      setEmulatorError(true);
    } finally {
      setBusy(false);
    }
  }

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
            <Button
              size="lg"
              className="w-full"
              data-testid="google-sign-in"
              onClick={() => void signIn()}
            >
              {t('signInWithGoogle')}
            </Button>
          )}
          {AUTH_EMULATOR_HOST !== '' ? (
            <form data-testid="emulator-form" className="space-y-2" onSubmit={submitEmulator}>
              <p className="text-sm text-foreground-secondary">{t('emulatorHint')}</p>
              <Input
                data-testid="emulator-email"
                type="email"
                autoComplete="username"
                placeholder={t('emulatorEmail')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                data-testid="emulator-password"
                type="password"
                autoComplete="current-password"
                placeholder={t('emulatorPassword')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={busy}
                data-testid="emulator-submit"
              >
                {t('emulatorSubmit')}
              </Button>
              {emulatorError ? (
                <p
                  role="alert"
                  data-testid="emulator-error"
                  className="text-sm font-medium text-destructive"
                >
                  {t('emulatorFailed')}
                </p>
              ) : null}
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
