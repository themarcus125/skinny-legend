import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-8 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 shadow-raised">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Không có quyền truy cập</h1>
        <p className="text-base text-muted-foreground">
          Tài khoản này không phải quản trị viên đang hoạt động. Nhờ quản trị viên cấp quyền
          (<code>role=admin</code>, <code>status=active</code>) rồi đăng nhập lại.
        </p>
        <Link href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring text-sm font-medium text-brand-fg underline-offset-4 hover:underline">
          Thử lại
        </Link>
        <SignOutButton />
      </div>
    </main>
  );
}
