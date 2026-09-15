import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { useTranslations } from 'use-intl';
import { EmptyState, SurfaceCard } from '@skinny/ui';
import { QuestionGlyph } from '@/app/icons';
import { Button } from '@/ui/button';

/**
 * The router's last resort, and in practice a deploy story.
 *
 * `registerType: 'autoUpdate'` makes the new service worker `skipWaiting()` + `clientsClaim()` and
 * `cleanupOutdatedCaches()`, so an app that was open during a deploy is now claimed by a worker
 * whose precache no longer holds the old hashed chunks. The first tap on a tab the member had not
 * visited yet does `import('/assets/trends-<oldhash>.js')`, Pages answers 404, and React Router's
 * default error page — unstyled, English, "Unexpected Application Error!" — takes the screen.
 *
 * So: a branded, localised screen, and for exactly that failure one automatic reload, which picks
 * up the new `index.html` and its new chunk names. Once, not in a loop: if the reload lands on the
 * same error the member is offline or the deploy is broken, and a reload cycle would make that
 * impossible to even read.
 */

/** Session-scoped, so the one-shot resets with the tab rather than following the member forever. */
export const RELOAD_STAMP_KEY = 'skinny.chunk-reload';

/** How long a stamp suppresses another automatic reload. Longer than any cold boot. */
export const RELOAD_COOLDOWN_MS = 30_000;

/**
 * A failed dynamic import, across browsers: Chrome/Safari throw a `TypeError` whose message names
 * the module, Firefox an `error loading dynamically imported module`, and bundlers a
 * `ChunkLoadError`. Matched on the message because none of them is a distinct error class.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  if (typeof message !== 'string') return false;
  return (
    /dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk \d+ failed/i.test(message)
  );
}

/**
 * Whether this error earns an automatic reload right now. Pure so the one-shot rule is testable
 * without a live `location`.
 */
export function shouldAutoReload(error: unknown, stamp: string | null, now: number): boolean {
  if (!isChunkLoadError(error)) return false;
  const last = stamp === null ? NaN : Number(stamp);
  return Number.isNaN(last) || now - last > RELOAD_COOLDOWN_MS;
}

/** `sessionStorage` throws in a locked-down webview; a missing stamp is a safe answer there. */
function readStamp(): string | null {
  try {
    return sessionStorage.getItem(RELOAD_STAMP_KEY);
  } catch {
    return null;
  }
}

function writeStamp(now: number): void {
  try {
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(now));
  } catch {
    /* no session storage; the reload simply is not rate-limited */
  }
}

/**
 * Runs the one-shot rule against `sessionStorage` and reloads if it says so. Exported for the
 * test, which drives it with its own `reload`.
 */
export function autoReloadOnChunkError(error: unknown, reload: () => void, now = Date.now()): boolean {
  if (!shouldAutoReload(error, readStamp(), now)) return false;
  writeStamp(now);
  reload();
  return true;
}

export function RouteError() {
  const error = useRouteError();
  const t = useTranslations();

  useEffect(() => {
    autoReloadOnChunkError(error, () => {
      window.location.reload();
    });
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <SurfaceCard as="section" className="w-full">
        <EmptyState
          icon={<QuestionGlyph className="text-primary size-12" />}
          title={t('pwa.crashTitle')}
          description={t('pwa.crashBody')}
          className="px-0 py-2"
        />
      </SurfaceCard>

      <Button
        size="lg"
        fullWidth
        onClick={() => {
          window.location.reload();
        }}
      >
        {t('pwa.updateAction')}
      </Button>
    </main>
  );
}

RouteError.displayName = 'RouteError';
