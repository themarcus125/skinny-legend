import { NavLink } from 'react-router';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { CameraGlyph, ChartGlyph, HouseGlyph, PersonGlyph, TrophyGlyph } from './icons';

/**
 * The four destinations. `Ghi nhận` is deliberately NOT one of them: it is an action, not a
 * place, so the spec gives it a separated camera bubble that sits above the bar (§2).
 */
export const TABS = [
  { to: '/', key: 'nav.overview', Glyph: HouseGlyph },
  { to: '/leaderboard', key: 'nav.leaderboard', Glyph: TrophyGlyph },
  { to: '/trends', key: 'nav.trends', Glyph: ChartGlyph },
  { to: '/account', key: 'nav.account', Glyph: PersonGlyph },
] as const;

/** Where the camera bubble goes. Shared with the push deep link (spec §4). */
export const TRACK_ROUTE = '/track';

/**
 * Bottom tab bar plus the camera bubble. Both are fixed to the viewport and padded out of the
 * home-indicator area with `env(safe-area-inset-bottom)`; every target is at least 44px.
 *
 * The bubble is rendered as a sibling of `<nav>`, not a child: assistive tech should hear four
 * navigation destinations, and the fifth control is a button-shaped action.
 */
export function TabBar() {
  const t = useTranslations();

  return (
    <>
      <NavLink
        to={TRACK_ROUTE}
        aria-label={t('nav.track')}
        title={t('nav.primaryAction')}
        className={({ isActive }) =>
          cn(
            // Clear of the bar itself (≈60px) so it never sits on top of a tab's label.
            'fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-1/2 z-20 -translate-x-1/2',
            'flex size-14 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-dialog',
            'transition-transform active:scale-95',
            isActive && 'ring-2 ring-primary-border ring-offset-2 ring-offset-background',
          )
        }
      >
        <CameraGlyph className="size-7" />
      </NavLink>

      <nav
        aria-label={t('nav.tabBar')}
        className={cn(
          'fixed inset-x-0 bottom-0 z-10 border-t border-border bg-elevated/95 backdrop-blur',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="mx-auto flex max-w-[430px] items-stretch">
          {TABS.map(({ to, key, Glyph }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2',
                    'type-caption transition-colors',
                    isActive ? 'text-foreground' : 'text-foreground-subtle',
                  )
                }
              >
                <Glyph className="size-6" />
                <span>{t(key)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
