import { describe, expect, it } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import type { FeedEntryDto, FeedResponse } from '@skinny/shared/wire';
import { setCommentCountInFeed, settleHeartInFeed, toggleHeartInFeed } from './feed-model';

const entry = (id: string, over: Partial<FeedEntryDto> = {}): FeedEntryDto => ({
  id,
  userId: 'u1',
  photoUrl: 'x',
  thumbUrl: null,
  takenAt: '2026-09-14T03:00:00.000Z',
  localDate: '2026-09-14',
  status: 'confirmed',
  categories: ['exercise'],
  placeName: null,
  placeSource: 'none',
  title: null,
  note: null,
  createdAt: '2026-09-14T03:00:01.000Z',
  user: { id: 'u1', displayName: 'Khoa', avatarUrl: null },
  heartCount: 0,
  commentCount: 0,
  heartedByMe: false,
  ...over,
});

const pages = (): InfiniteData<FeedResponse, string | undefined> => ({
  pageParams: [undefined, 'c1'],
  pages: [
    { entries: [entry('a'), entry('b', { heartCount: 2, heartedByMe: true })], nextCursor: 'c1' },
    { entries: [entry('c', { heartCount: 5 })], nextCursor: null },
  ],
});

describe('toggleHeartInFeed', () => {
  it('flips exactly one entry, across pages, and leaves the rest untouched', () => {
    const next = toggleHeartInFeed(pages(), 'c');
    expect(next.pages[1]!.entries[0]).toMatchObject({ heartCount: 6, heartedByMe: true });
    expect(next.pages[0]!.entries[0]).toMatchObject({ heartCount: 0, heartedByMe: false });
    expect(next.pages[0]!.entries[1]).toMatchObject({ heartCount: 2, heartedByMe: true });
  });

  it('unhearts down but never below zero', () => {
    const next = toggleHeartInFeed(pages(), 'b');
    expect(next.pages[0]!.entries[1]).toMatchObject({ heartCount: 1, heartedByMe: false });
    const zeroed = toggleHeartInFeed(toggleHeartInFeed(pages(), 'a'), 'a');
    expect(zeroed.pages[0]!.entries[0]).toMatchObject({ heartCount: 0, heartedByMe: false });
    const forced = {
      ...pages(),
      pages: [{ entries: [entry('z', { heartCount: 0, heartedByMe: true })], nextCursor: null }],
    };
    expect(toggleHeartInFeed(forced, 'z').pages[0]!.entries[0]!.heartCount).toBe(0);
  });

  it('does not mutate its input', () => {
    const before = pages();
    toggleHeartInFeed(before, 'a');
    expect(before.pages[0]!.entries[0]!.heartCount).toBe(0);
  });
});

describe('settleHeartInFeed and setCommentCountInFeed', () => {
  it('adopt the server truth for one entry', () => {
    const settled = settleHeartInFeed(pages(), 'a', { heartCount: 3, heartedByMe: true });
    expect(settled.pages[0]!.entries[0]).toMatchObject({ heartCount: 3, heartedByMe: true });
    const counted = setCommentCountInFeed(pages(), 'c', 4);
    expect(counted.pages[1]!.entries[0]!.commentCount).toBe(4);
  });
});
