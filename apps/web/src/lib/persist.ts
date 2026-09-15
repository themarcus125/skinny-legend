import type { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClient,
  type PersistedClient,
  type Persister,
} from '@tanstack/query-persist-client-core';
import { del, get, set } from 'idb-keyval';

/** Spec §5: a persisted cache is good for a day, then the app refetches from scratch. */
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24;

/** One IndexedDB key holds the whole dehydrated client. */
export const PERSIST_KEY = 'skinny.query-cache';

/**
 * A different build gets a different cache: `VITE_BUILD_ID` (Cloudflare Pages exposes the commit
 * sha; see `docs/deploy/web-pages.md`) busts the snapshot whenever the wire shapes may have
 * moved. Absent it, the empty buster keeps the snapshot across reloads of the same build.
 */
function buster(): string {
  return import.meta.env.VITE_BUILD_ID ?? '';
}

/**
 * IndexedDB persister. localStorage would be capped at ~5 MB and blocks the main thread.
 *
 * Every storage call is wrapped: Safari private mode, a locked-down in-app webview and jsdom all
 * either lack `indexedDB` or reject on first use, and none of those is a reason to fail the boot
 * — the app simply runs without a warm cache. A rejected `restoreClient` resolves to `undefined`,
 * which is exactly what "nothing persisted yet" looks like to react-query.
 */
export function createIdbPersister(key = PERSIST_KEY): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(key, client);
      } catch {
        /* no persistence available; the in-memory cache still works */
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(key);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(key);
      } catch {
        /* nothing to remove if the store never opened */
      }
    },
  };
}

/**
 * How long the boot waits for the restore before painting anyway. A store that never answers —
 * a Safari private window that blocks on `open`, a webview whose IDB request neither resolves nor
 * rejects — would otherwise hold the app on a blank page forever.
 */
export const RESTORE_TIMEOUT_MS = 1000;

/**
 * Restores the last snapshot into `client` and keeps writing new ones. Resolves once the restore
 * has finished (or failed, or run out of time), so `main.tsx` can await it before the first paint
 * and a cold, offline launch paints last-known data instead of a row of spinners.
 *
 * `persistQueryClient`'s restore cannot be cancelled, so one that beats the timeout by a hair still
 * hydrates afterwards. That is harmless: `hydrate` only overwrites a query whose persisted
 * `dataUpdatedAt` is newer than what is already in memory, so a fetch that has landed in the
 * meantime keeps the screen.
 *
 * Mutations are never dehydrated: a write needs a connection (spec §5), and replaying a queued
 * upload hours later would post a photo the member has forgotten about. Auth and push state are
 * not in the query cache at all — the session lives in `src/auth/session.tsx` and the push
 * registration in `localStorage` — so neither rides along here.
 */
export async function attachPersistence(
  client: QueryClient,
  timeoutMs = RESTORE_TIMEOUT_MS,
): Promise<void> {
  try {
    const [, restored] = persistQueryClient({
      queryClient: client,
      persister: createIdbPersister(),
      maxAge: PERSIST_MAX_AGE_MS,
      buster: buster(),
      dehydrateOptions: { shouldDehydrateMutation: () => false },
    });
    await Promise.race([
      restored,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    /* an unavailable store must never block the boot */
  }
}
