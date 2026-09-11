'use client';

import { FlameIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/sign-out-button';
import { useAuth } from '@/lib/auth/auth-context';

export function SignInCard({ error }: { error?: string }) {
  const { signIn, status, hasFirebaseUser } = useAuth();
  // A Firebase user can be signed in while the app still rejects them (disabled/pending
  // account, or any other /auth/session failure) — the "Sign in with Google" button won't
  // help since Firebase already considers them authenticated, so offer a clean way out instead.
  const isStuckSignedIn = status === 'error' && hasFirebaseUser;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-8">
      <Card className="w-full max-w-[380px] shadow-raised">
        <CardHeader className="items-center justify-items-center text-center">
          <span
            aria-hidden
            className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand text-primary-foreground"
          >
            <FlameIcon className="size-5" />
          </span>
          <CardTitle className="text-xl font-semibold tracking-[-0.01em]">Skinny Legend Admin</CardTitle>
          <CardDescription className="text-base">Đăng nhập bằng tài khoản Google quản trị.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">
              {error}
            </p>
          ) : null}
          {isStuckSignedIn ? (
            <SignOutButton className="w-full" />
          ) : (
            <Button size="lg" className="w-full" onClick={() => void signIn()}>
              Đăng nhập với Google
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
