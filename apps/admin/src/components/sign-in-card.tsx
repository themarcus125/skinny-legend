'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/auth-context';

export function SignInCard({ error }: { error?: string }) {
  const { signIn } = useAuth();
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
          <Button className="w-full" onClick={() => void signIn()}>
            Đăng nhập với Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
