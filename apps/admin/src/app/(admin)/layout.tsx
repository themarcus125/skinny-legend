import { AppSidebar } from '@/components/app-sidebar';
import { AuthGate } from '@/lib/auth/auth-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthGate>
  );
}
