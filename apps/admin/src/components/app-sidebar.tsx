'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FlameIcon,
  ImagesIcon,
  LayoutDashboardIcon,
  MessageSquareTextIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignOutButton } from '@/components/sign-out-button';
import { IS_MOCK } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';

const NAV = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboardIcon },
  { href: '/members', label: 'Thành viên', icon: UsersIcon },
  { href: '/entries', label: 'Mục ghi', icon: ImagesIcon },
  { href: '/rules', label: 'Luật chơi', icon: SlidersHorizontalIcon },
  { href: '/feedback', label: 'Góp ý', icon: MessageSquareTextIcon },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="sticky top-0 flex h-dvh w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-white shadow-raised"
        >
          <FlameIcon className="size-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">Skinny Legend</p>
          <p className="text-xs leading-4 text-muted-foreground">Bảng quản trị</p>
        </div>
      </div>
      {IS_MOCK ? (
        <p className="mx-2 mb-4 inline-flex h-6 w-fit items-center rounded-full bg-warning-soft px-2.5 text-xs font-medium text-warning-fg">
          Chế độ mock
        </p>
      ) : null}

      <nav aria-label="Điều hướng" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground transition-colors',
                'hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                active &&
                  'bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-nav-active hover:bg-sidebar-primary',
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground',
                  active && 'text-brand',
                )}
                strokeWidth={active ? 2.25 : 2}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          >
            {(user?.displayName ?? '?').charAt(0).toUpperCase()}
          </span>
          <p className="truncate text-sm font-medium">{user?.displayName ?? ''}</p>
        </div>
        <SignOutButton variant="ghost" size="sm" className="mt-1 w-full justify-start text-secondary-foreground" />
      </div>
    </aside>
  );
}
