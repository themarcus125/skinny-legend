import { QueryClient } from '@tanstack/react-query';
import { PERSIST_MAX_AGE_MS } from './persist';

/**
 * Every server-state key the app uses, in one place: a screen and the code that invalidates it
 * after a mutation have to spell the same key, and a typo is otherwise a silent no-op.
 */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  leaderboard: ['leaderboard'] as const,
  trends: ['trends'] as const,
  feed: ['feed'] as const,
  /** The prefix every map query shares — invalidating it clears every `days` window. */
  map: ['map'] as const,
  mapPins: (days: number) => ['map', days] as const,
  myEntries: ['entries', 'mine'] as const,
  /** One heatmap square's rows: a bounded walk of `myEntries`, cached per day (Task 11). */
  dayEntries: (date: string) => ['entries', 'mine', 'day', date] as const,
  userEntries: (id: string) => ['entries', 'user', id] as const,
  /** One entry's comment thread, opened from the feed card. */
  comments: (entryId: string) => ['comments', entryId] as const,
  me: ['me'] as const,
  /** `GET /places/nearby` for one fix; the API caches by cell, so the key is the raw pair. */
  places: (lat: number, lng: number) => ['places', lat, lng] as const,
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The cache must outlive a cold start for the persister to be worth anything.
        gcTime: PERSIST_MAX_AGE_MS,
        staleTime: 1000 * 30,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}
