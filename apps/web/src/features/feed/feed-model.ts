import type { InfiniteData } from '@tanstack/react-query';
import type { FeedEntryDto, FeedResponse, HeartResponse } from '@skinny/shared/wire';

export type FeedPages = InfiniteData<FeedResponse, string | undefined>;

/** Applies `patch` to the one entry with `entryId`, wherever it sits in the paged cache. */
function patchEntry(
  data: FeedPages,
  entryId: string,
  patch: (entry: FeedEntryDto) => FeedEntryDto,
): FeedPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      entries: page.entries.map((entry) => (entry.id === entryId ? patch(entry) : entry)),
    })),
  };
}

/** The optimistic flip: the flag inverts and the count follows, floored at zero. */
export function toggleHeartInFeed(data: FeedPages, entryId: string): FeedPages {
  return patchEntry(data, entryId, (entry) => ({
    ...entry,
    heartedByMe: !entry.heartedByMe,
    heartCount: Math.max(0, entry.heartCount + (entry.heartedByMe ? -1 : 1)),
  }));
}

/** The server's answer replaces the guess. */
export function settleHeartInFeed(
  data: FeedPages,
  entryId: string,
  truth: HeartResponse,
): FeedPages {
  return patchEntry(data, entryId, (entry) => ({ ...entry, ...truth }));
}

/** The thread's own count, after a comment is posted or deleted, replaces the card's. */
export function setCommentCountInFeed(
  data: FeedPages,
  entryId: string,
  count: number,
): FeedPages {
  return patchEntry(data, entryId, (entry) => ({ ...entry, commentCount: count }));
}
