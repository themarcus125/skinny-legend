import { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClient,
  type PersistedClient,
  type Persister,
} from '@tanstack/query-persist-client-core';
import { del, get, set } from 'idb-keyval';

/** Spec §5: a persisted cache is good for a day, then the app refetches from scratch. */
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24;
const PERSIST_KEY = 'skinny.query-cache';

/**
 * Every server-state key the app uses, in one place: a screen and the code that invalidates it
 * after a mutation have to spell the same key, and a typo is otherwise a silent no-op.
 */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  leaderboard: ['leaderboard'] as const,
  trends: ['trends'] as const,
  feed: ['feed'] as const,
  mapPins: (days: number) => ['map', days] as const,
  myEntries: ['entries', 'mine'] as const,
  userEntries: (id: string) => ['entries', 'user', id] as const,
  me: ['me'] as const,
  /** `GET /places/nearby` for one fix; the API caches by cell, so the key is the raw pair. */
  places: (lat: number, lng: number) => ['places', lat, lng] as const,
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The cache must outlive a cold start for the persister to be worth anything.
        gcTime: PERSIST_MAX_AGE,
        staleTime: 1000 * 30,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}

/** IndexedDB persister. localStorage would be capped at ~5 MB and blocks the main thread. */
export function createIdbPersister(key = PERSIST_KEY): Persister {
  return {
    persistClient: (client: PersistedClient) => set(key, client),
    restoreClient: () => get<PersistedClient>(key),
    removeClient: () => del(key),
  };
}

/**
 * Starts persistence and returns the unsubscribe. Best-effort: a browser with IndexedDB blocked
 * (Safari private mode, some in-app webviews) simply runs without a warm cache.
 */
export function startPersistence(queryClient: QueryClient): () => void {
  try {
    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister: createIdbPersister(),
      maxAge: PERSIST_MAX_AGE,
    });
    return unsubscribe;
  } catch {
    return () => {};
  }
}
