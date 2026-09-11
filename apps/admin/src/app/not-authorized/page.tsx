import Link from 'next/link';

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Không có quyền truy cập</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Tài khoản này không phải quản trị viên đang hoạt động. Nhờ quản trị viên cấp quyền
        (<code>role=admin</code>, <code>status=active</code>) rồi đăng nhập lại.
      </p>
      <Link href="/" className="text-sm underline">
        Thử lại
      </Link>
    </main>
  );
}
