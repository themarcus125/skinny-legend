import { Outlet } from 'react-router';
import { SCROLL_CONTAINER_ATTR } from './large-title';
import { TabBar } from './tab-bar';
import { useTheme } from './use-theme';

/**
 * The layout route: one scroll container holding the current screen, with the tab bar and the
 * camera bubble fixed over it. Each screen renders its own `<LargeTitle>` inside the container,
 * which is what lets the title collapse against this element's scroll.
 *
 * `useTheme()` lives here rather than in `main.tsx` so the whole app re-renders with the
 * resolved appearance the moment the member changes it in Account.
 */
export function AppShell() {
  useTheme();

  return (
    <div className="flex h-dvh flex-col">
      <main
        {...{ [SCROLL_CONTAINER_ATTR]: true }}
        // The padding clears the tab bar (≈60px), the camera bubble above it (56px + gap) and
        // the home indicator.
        className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+9rem)]"
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
