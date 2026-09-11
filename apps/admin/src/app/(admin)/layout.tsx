import { AppSidebar, MobileTopBar } from '@/components/app-sidebar';
import { AuthGate } from '@/lib/auth/auth-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-dvh flex-col bg-background md:flex-row">
        <AppSidebar />
        <MobileTopBar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-5 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </AuthGate>
  );
}
