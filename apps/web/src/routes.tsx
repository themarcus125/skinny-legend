import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/app/shell';
import { SessionGate } from '@/app/session-gate';

/**
 * Every screen in spec §4 has a route from this task on, each pointing at a placeholder that
 * renders its own large title. Tasks 6–14 fill the bodies in without touching this file.
 *
 * `lazy` modules export `Component`, React Router 7's convention, so each screen is its own
 * chunk — the map (Leaflet) and Trends (Recharts) are the ones that make that worth doing.
 *
 * Everything sits under one pathless `<SessionGate/>` route (Task 6): it redirects by session
 * state, which is how `AppEnvironment`'s `switch` over `SessionState` becomes routing here.
 */
export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      // Outside the shell: no tab bar until a member is active.
      { path: '/sign-in', lazy: () => import('@/screens/sign-in') },
      { path: '/pending', lazy: () => import('@/screens/pending') },
      { path: '/disabled', lazy: () => import('@/screens/disabled') },
      {
        element: <AppShell />,
        children: [
          { index: true, lazy: () => import('@/screens/overview') },
          { path: 'track', lazy: () => import('@/screens/track') },
          { path: 'leaderboard', lazy: () => import('@/screens/leaderboard') },
          { path: 'leaderboard/:userId', lazy: () => import('@/screens/member') },
          { path: 'trends', lazy: () => import('@/screens/trends') },
          { path: 'feed', lazy: () => import('@/screens/feed') },
          { path: 'feed/map', lazy: () => import('@/screens/map') },
          { path: 'account', lazy: () => import('@/screens/account') },
          // An unknown path inside the app is a stale link, not a crash: land on Tổng quan.
          { path: '*', lazy: () => import('@/screens/overview') },
        ],
      },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
