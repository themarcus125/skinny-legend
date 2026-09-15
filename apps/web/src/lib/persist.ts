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
 * Restores the last snapshot into `client` and keeps writing new ones. Resolves once the restore
 * has finished (or failed), so `main.tsx` can await it before the first paint and a cold, offline
 * launch paints last-known data instead of a row of spinners.
 *
 * Mutations are never dehydrated: a write needs a connection (spec §5), and replaying a queued
 * upload hours later would post a photo the member has forgotten about. Auth and push state are
 * not in the query cache at all — the session lives in `src/auth/session.tsx` and the push
 * registration in `localStorage` — so neither rides along here.
 */
export async function attachPersistence(client: QueryClient): Promise<void> {
  try {
    const [, restored] = persistQueryClient({
      queryClient: client,
      persister: createIdbPersister(),
      maxAge: PERSIST_MAX_AGE_MS,
      buster: buster(),
      dehydrateOptions: { shouldDehydrateMutation: () => false },
    });
    await restored;
  } catch {
    /* an unavailable store must never block the boot */
  }
}
