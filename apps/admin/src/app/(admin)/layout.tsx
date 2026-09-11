import { AppSidebar } from '@/components/app-sidebar';
import { AuthGate } from '@/lib/auth/auth-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-dvh bg-background">
        <AppSidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
        </main>
      </div>
    </AuthGate>
  );
}
