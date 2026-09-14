'use client';

import { useSyncExternalStore } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const subscribeNothing = () => () => {};

/**
 * Sidebar light/dark switch. next-themes persists the choice in localStorage and applies the
 * `dark` class before paint; until it has mounted we render the light icon with the control
 * disabled, because the resolved theme is not knowable on the server.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const { resolvedTheme, setTheme } = useTheme();
  // Hydration guard without a setState-in-effect: false on the server, true once mounted.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t('theme')}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn('w-full justify-start gap-2.5 text-secondary-foreground', className)}
    >
      {isDark ? (
        <MoonIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <SunIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{isDark ? t('dark') : t('light')}</span>
    </Button>
  );
}
