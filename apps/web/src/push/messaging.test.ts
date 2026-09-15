import { describe, expect, it } from 'vitest';
import type { MessagePayload } from 'firebase/messaging';
import { DEFAULT_DEEP_LINK, safeDeepLink, toPushMessage } from './messaging';

/**
 * The deep link arrives over the wire, so it is untrusted input: a path that resolves to another
 * origin must never reach the router or `openWindow`. The same guard is spelled out a second time
 * in `public/firebase-messaging-sw.js`, which cannot import this module.
 */
describe('safeDeepLink', () => {
  it('keeps a same-origin in-app path', () => {
    expect(safeDeepLink('/track')).toBe('/track');
    expect(safeDeepLink('/leaderboard/u1')).toBe('/leaderboard/u1');
  });

  it('rejects a protocol-relative path that resolves off-origin', () => {
    expect(safeDeepLink('//evil.com/x')).toBe(DEFAULT_DEEP_LINK);
    expect(new URL('//evil.com/x', 'https://app.example').origin).toBe('https://evil.com');
  });

  it('rejects a backslash path, which browsers normalise to a protocol-relative one', () => {
    expect(safeDeepLink('/\\evil.com/x')).toBe(DEFAULT_DEEP_LINK);
    expect(safeDeepLink('/\\/evil.com')).toBe(DEFAULT_DEEP_LINK);
  });

  it('rejects anything that is not a path at all', () => {
    expect(safeDeepLink(undefined)).toBe(DEFAULT_DEEP_LINK);
    expect(safeDeepLink('')).toBe(DEFAULT_DEEP_LINK);
    expect(safeDeepLink('https://evil.com')).toBe(DEFAULT_DEEP_LINK);
    expect(safeDeepLink('javascript:alert(1)')).toBe(DEFAULT_DEEP_LINK);
    expect(safeDeepLink('leaderboard/u1')).toBe(DEFAULT_DEEP_LINK);
  });

  // The API sends iOS's vocabulary (a bare tab name, what `PushPayload.tab(from:)` parses), so
  // the web has to speak it too — `track` lands on Track because it is mapped, not because it
  // happens to be the fallback.
  it('maps the bare tab names the API sends onto routes', () => {
    expect(safeDeepLink('track')).toBe('/track');
    expect(safeDeepLink('dashboard')).toBe('/');
    expect(safeDeepLink('leaderboard')).toBe('/leaderboard');
    expect(safeDeepLink('trends')).toBe('/trends');
    expect(safeDeepLink('account')).toBe('/account');
    expect(safeDeepLink('feed')).toBe('/feed');
    expect(safeDeepLink('map')).toBe('/feed/map');
  });

  it('does not treat an inherited Object property as a tab name', () => {
    expect(safeDeepLink('constructor')).toBe(DEFAULT_DEEP_LINK);
    expect(safeDeepLink('toString')).toBe(DEFAULT_DEEP_LINK);
  });
});

describe('toPushMessage', () => {
  const payload = (data: Record<string, string>): MessagePayload =>
    ({ data }) as unknown as MessagePayload;

  it('reads a data-only payload, the shape the notification job sends', () => {
    expect(toPushMessage(payload({ title: 'Nhắc nhở', body: 'Ghi nhận đi', deepLink: '/track' })))
      .toEqual({ title: 'Nhắc nhở', body: 'Ghi nhận đi', deepLink: '/track' });
  });

  it('falls back to /track rather than following an off-origin deep link', () => {
    expect(toPushMessage(payload({ title: 'x', deepLink: '//evil.com' }))?.deepLink).toBe('/track');
  });

  it('ignores a payload with no copy at all', () => {
    expect(toPushMessage(payload({ deepLink: '/track' }))).toBeNull();
  });
});
