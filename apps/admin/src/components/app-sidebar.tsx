'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BellIcon,
  FlameIcon,
  ImagesIcon,
  LayoutDashboardIcon,
  MapIcon,
  MessageSquareTextIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitch } from '@/components/language-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { IS_MOCK } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';

/** Section links; `key` is the `nav.*` message key, translated at render. */
const NAV = [
  { href: '/', key: 'overview', icon: LayoutDashboardIcon },
  { href: '/members', key: 'members', icon: UsersIcon },
  { href: '/entries', key: 'entries', icon: ImagesIcon },
  { href: '/map', key: 'map', icon: MapIcon },
  { href: '/rules', key: 'rules', icon: SlidersHorizontalIcon },
  { href: '/feedback', key: 'feedback', icon: MessageSquareTextIcon },
  { href: '/notifications', key: 'notifications', icon: BellIcon },
] as const;

function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground"
    >
      <FlameIcon className="size-4" strokeWidth={2.25} />
    </span>
  );
}

/** The seven section links — same hrefs, labels and aria-current in the rail and the phone top bar. */
function NavLinks({ layout }: { layout: 'rail' | 'bar' }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  return (
    <nav
      aria-label={t('label')}
      className={layout === 'rail' ? 'flex flex-col gap-0.5' : 'flex gap-1 overflow-x-auto px-3 pb-2'}
    >
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex h-11 shrink-0 items-center gap-2.5 rounded-md border border-transparent px-3 text-sm font-medium text-sidebar-foreground transition-colors',
              'hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active &&
                'border-primary-border bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary',
              layout === 'bar' && 'h-9 gap-2 px-2.5',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground',
                active && 'text-sidebar-primary-foreground',
              )}
              strokeWidth={active ? 2.25 : 2}
            />
            <span className="truncate">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop rail (md and up). Below md it is display:none and MobileTopBar takes over. */
export function AppSidebar() {
  const { user } = useAuth();
  const t = useTranslations('nav');

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-5">Skinny Legend</p>
          <p className="type-label text-foreground-subtle">{t('subtitle')}</p>
        </div>
      </div>
      {IS_MOCK ? (
        <p className="type-label mx-2 mb-4 inline-flex h-6 w-fit items-center rounded-full bg-warning-soft px-2.5 text-warning">
          {t('mock')}
        </p>
      ) : null}

      <NavLinks layout="rail" />

      <div className="mt-auto border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-secondary-foreground"
          >
            {(user?.displayName ?? '?').charAt(0).toUpperCase()}
          </span>
          <p className="truncate text-sm font-medium">{user?.displayName ?? ''}</p>
        </div>
        <LanguageSwitch />
        <div className="px-2">
          <ThemeToggle />
        </div>
        <SignOutButton variant="ghost" size="sm" className="mx-2 mt-1 w-[calc(100%-1rem)] justify-start text-secondary-foreground" />
      </div>
    </aside>
  );
}

/**
 * Phone header (below md): brand mark, sign-out, and the same NAV as a horizontal scroller.
 * No language switch here — the bar has no room; the desktop rail is where the language changes.
 */
export function MobileTopBar() {
  const t = useTranslations('nav');
  return (
    <header className="sticky top-0 z-20 border-b border-sidebar-border bg-sidebar md:hidden">
      <div className="flex h-12 items-center gap-2.5 px-3">
        <BrandMark />
        <p className="truncate text-sm font-bold">Skinny Legend</p>
        {IS_MOCK ? (
          <span className="type-label inline-flex h-6 shrink-0 items-center rounded-full bg-warning-soft px-2.5 text-warning">
            {t('mock')}
          </span>
        ) : null}
        <SignOutButton variant="ghost" size="sm" className="ml-auto text-secondary-foreground" />
      </div>
      <NavLinks layout="bar" />
    </header>
  );
}
