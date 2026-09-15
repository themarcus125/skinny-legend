import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ThemeProvider } from '@/app/theme-provider';
import { SessionGateProvider } from '@/auth/session';
import { LocaleProvider } from '@/i18n/provider';
import { ApiProvider } from '@/lib/api';
import { attachPersistence } from '@/lib/persist';
import { makeQueryClient } from '@/lib/query';
import { createRouter } from '@/routes';
import { reloadOnWorkerTakeover } from '@/app/sw-update';
import './index.css';

const queryClient = makeQueryClient();

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing #root.');
const root = container;

function render() {
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <ApiProvider>
              <SessionGateProvider>
                <RouterProvider router={createRouter()} />
              </SessionGateProvider>
            </ApiProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

/**
 * The restore is awaited before the first render (spec §5): painting the shell first and swapping
 * the cached data in a tick later is exactly the flash of empty state the persister exists to
 * avoid, and on a cold offline launch there is nothing to swap in later at all.
 * `attachPersistence` never rejects, so the boot always reaches `render`, IndexedDB or not. It is
 * a `.then` rather than a top-level `await` so the entry chunk carries no module-level await for
 * the build target to down-level.
 * It also carries its own one-second cap (`RESTORE_TIMEOUT_MS`), so a store that never answers
 * cannot hold the boot on a blank page.
 */
void attachPersistence(queryClient).then(render);

// An update that claims this page has already invalidated its lazy chunks; reload before the
// member finds out by tapping one. Guarded so a first install does not flash (see sw-update.ts).
reloadOnWorkerTakeover();
