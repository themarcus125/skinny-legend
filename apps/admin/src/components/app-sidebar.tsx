'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { IS_MOCK } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';

const NAV = [
  { href: '/', label: 'Tổng quan' },
  { href: '/members', label: 'Thành viên' },
  { href: '/entries', label: 'Mục ghi' },
  { href: '/rules', label: 'Luật chơi' },
  { href: '/feedback', label: 'Góp ý' },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { user, signOutUser } = useAuth();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 p-4">
      <div className="mb-6">
        <p className="text-sm font-semibold">Skinny Legend</p>
        <p className="text-xs text-muted-foreground">Bảng quản trị</p>
        {IS_MOCK ? <p className="mt-1 text-xs font-medium text-amber-600">Chế độ mock</p> : null}
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                active && 'bg-accent font-medium text-accent-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 pt-6">
        <p className="truncate text-xs text-muted-foreground">{user?.displayName ?? ''}</p>
        <Button variant="outline" size="sm" className="w-full" onClick={() => void signOutUser()}>
          Đăng xuất
        </Button>
      </div>
    </aside>
  );
}
