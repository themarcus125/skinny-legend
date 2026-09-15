import { NavLink } from 'react-router';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { CameraGlyph, ChartGlyph, HouseGlyph, PersonGlyph, TrophyGlyph } from './icons';

/**
 * The four destinations. `Ghi nhận` is deliberately NOT one of them: it is an action, not a
 * place, so the spec gives it a separated camera bubble at the trailing end of the bar (§2).
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
 * Bottom tab bar plus the camera bubble, laid out the way iOS renders them
 * (`ios/.../MainTabView.swift`: a `role: .search` tab): the four destinations sit in one capsule
 * and `Ghi nhận` is a **separate circular bubble at the trailing end**, sharing the capsule's
 * vertical centre — not floating above it.
 *
 * One fixed row owns the whole thing, so the two pieces cannot drift apart, and the row alone
 * carries `env(safe-area-inset-bottom)`; every target is at least 44px.
 *
 * The bubble is rendered as a sibling of `<nav>`, not a child: assistive tech should hear four
 * navigation destinations, and the fifth control is a button-shaped action.
 */
export function TabBar() {
  const t = useTranslations();

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2',
        'px-2 pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <nav
        aria-label={t('nav.tabBar')}
        className={cn(
          'min-w-0 flex-1 rounded-full border border-border bg-elevated/95 backdrop-blur',
          'shadow-dialog',
        )}
      >
        <ul className="flex items-stretch">
          {TABS.map(({ to, key, Glyph }) => (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-2',
                    // 11px, not `type-caption`'s 13px: iOS tab labels are 10pt, and four
                    // Vietnamese labels have to fit beside a 56px bubble without truncating.
                    'text-[11px] font-medium leading-tight transition-colors',
                    isActive ? 'text-foreground' : 'text-foreground-subtle',
                  )
                }
              >
                <Glyph className="size-6" />
                <span className="max-w-full truncate">{t(key)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <NavLink
        to={TRACK_ROUTE}
        aria-label={t('nav.track')}
        title={t('nav.primaryAction')}
        className={({ isActive }) =>
          cn(
            // Its own bubble at the trailing end, inline with the capsule — never on top of it.
            'flex size-14 shrink-0 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-dialog',
            'transition-transform active:scale-95',
            isActive && 'ring-2 ring-primary-border ring-offset-2 ring-offset-background',
          )
        }
      >
        <CameraGlyph className="size-7" />
      </NavLink>
    </div>
  );
}
