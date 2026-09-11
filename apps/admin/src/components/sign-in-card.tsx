'use client';

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
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Skinny Legend Admin</CardTitle>
          <CardDescription>Đăng nhập bằng tài khoản Google quản trị.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {isStuckSignedIn ? (
            <SignOutButton className="w-full" />
          ) : (
            <Button className="w-full" onClick={() => void signIn()}>
              Đăng nhập với Google
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
