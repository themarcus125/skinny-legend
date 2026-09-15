import { describe, expect, it } from 'vitest';
import { isThumbnailHost, thumbnailCacheKey } from './thumbnail-cache';

describe('isThumbnailHost', () => {
  it.each([
    ['pub-1234.r2.dev', true],
    ['abcdef.r2.cloudflarestorage.com', true],
    ['skinny-legend.pages.dev', false],
    ['api.skinnylegend.app', false],
    // Not a suffix match on the label: a look-alike host must not be treated as the bucket.
    ['evil-r2.dev', false],
  ])('recognises %s as the bucket: %s', (hostname, expected) => {
    expect(isThumbnailHost(hostname, null)).toBe(expected);
  });

  it('accepts the custom domain from VITE_R2_PUBLIC_HOST', () => {
    expect(isThumbnailHost('img.skinnylegend.app', 'img.skinnylegend.app')).toBe(true);
    expect(isThumbnailHost('img.skinnylegend.app', null)).toBe(false);
    expect(isThumbnailHost('other.skinnylegend.app', 'img.skinnylegend.app')).toBe(false);
  });
});

describe('thumbnailCacheKey', () => {
  const object = 'https://pub-1234.r2.dev/entries/2026/01/abc.jpg';

  it('strips the rotating presign query so an hourly re-sign hits the same entry', () => {
    const monday = `${object}?X-Amz-Date=20260101T010000Z&X-Amz-Expires=3600&X-Amz-Signature=aaa`;
    const tuesday = `${object}?X-Amz-Date=20260101T020000Z&X-Amz-Expires=3600&X-Amz-Signature=bbb`;

    expect(thumbnailCacheKey(monday)).toBe(object);
    expect(thumbnailCacheKey(monday)).toBe(thumbnailCacheKey(tuesday));
  });

  it('leaves an unsigned URL alone', () => {
    expect(thumbnailCacheKey(object)).toBe(object);
  });

  it('keeps two different objects apart', () => {
    expect(thumbnailCacheKey(`${object}?X-Amz-Signature=aaa`)).not.toBe(
      thumbnailCacheKey('https://pub-1234.r2.dev/entries/2026/01/def.jpg?X-Amz-Signature=aaa'),
    );
  });

  it('drops the fragment-free query only, not the path', () => {
    expect(thumbnailCacheKey('https://pub-1234.r2.dev/a/b%20c.jpg?x=1')).toBe(
      'https://pub-1234.r2.dev/a/b%20c.jpg',
    );
  });
});
