import { Outlet } from 'react-router';
import { SCROLL_CONTAINER_ATTR } from './large-title';
import { TabBar } from './tab-bar';

/**
 * The layout route: one scroll container holding the current screen, with the tab bar and the
 * camera bubble fixed over it. Each screen renders its own `<LargeTitle>` inside the container,
 * which is what lets the title collapse against this element's scroll.
 *
 * The appearance is *not* applied here: `/sign-in` sits outside this layout, so the theme hook
 * lives in `<ThemeProvider>` at the root instead (`src/app/theme-provider.tsx`).
 */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col">
      <main
        {...{ [SCROLL_CONTAINER_ATTR]: true }}
        // One clearance, not two: the bubble is now inline with the bar, so the fixed row is
        // 56px tall plus its own padding — no stacked-bubble allowance on top.
        className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)]"
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
