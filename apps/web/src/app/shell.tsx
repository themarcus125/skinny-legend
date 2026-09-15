import { Outlet } from 'react-router';
import { PushToastHost } from '@/push/toast';
import { InstallHint } from './install-hint';
import { SCROLL_CONTAINER_ATTR } from './large-title';
import { OfflineBanner } from './offline-banner';
import { PhotoViewerProvider } from './photo-viewer';
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
    <PhotoViewerProvider>
    <div className="flex h-dvh flex-col">
      {/*
        Above the scroll container, not inside it: the strip must not slide under a screen's
        sticky large title, and it must stay on screen for as long as the connection is down.
      */}
      <OfflineBanner />
      <main
        {...{ [SCROLL_CONTAINER_ATTR]: true }}
        // One clearance, not two: the bubble is now inline with the bar, so the fixed row is
        // 56px tall plus its own padding — no stacked-bubble allowance on top.
        className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5rem)]"
      >
        {/* iOS Safari only, once per member: push needs the app on the Home Screen. */}
        <InstallHint />
        <Outlet />
      </main>
      <TabBar />
      {/* Foreground pushes: the browser shows nothing while the tab is in front. */}
      <PushToastHost />
    </div>
    </PhotoViewerProvider>
  );
}
