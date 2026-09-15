import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEEP_LINK } from './messaging';
import { deepLinkFromMessage, observeServiceWorkerDeepLinks } from './deep-link';

/**
 * The FCM worker cannot navigate an app window it does not control, so it posts the destination
 * instead. That message crosses a boundary, so it is parsed defensively and re-checked with the
 * same `safeDeepLink` guard the worker applies.
 */
const message = (data: unknown) => new MessageEvent('message', { data });

describe('deepLinkFromMessage', () => {
  it('reads an in-app path out of the worker message', () => {
    expect(deepLinkFromMessage(message({ type: 'deepLink', deepLink: '/feed' }))).toBe('/feed');
  });

  it('maps the API/iOS tab vocabulary onto a route', () => {
    expect(deepLinkFromMessage(message({ type: 'deepLink', deepLink: 'track' }))).toBe('/track');
    // `feed` is the group log, which is Trang chủ since SKI-134 — not a redirect hop.
    expect(deepLinkFromMessage(message({ type: 'deepLink', deepLink: 'feed' }))).toBe('/');
  });

  it('falls back for an off-origin or missing link rather than trusting it', () => {
    expect(deepLinkFromMessage(message({ type: 'deepLink', deepLink: '//evil.com/x' }))).toBe(
      DEFAULT_DEEP_LINK,
    );
    expect(deepLinkFromMessage(message({ type: 'deepLink' }))).toBe(DEFAULT_DEEP_LINK);
  });

  it('ignores any other message on the channel', () => {
    expect(deepLinkFromMessage(message({ type: 'SKIP_WAITING' }))).toBeNull();
    expect(deepLinkFromMessage(message('deepLink'))).toBeNull();
    expect(deepLinkFromMessage(message(null))).toBeNull();
  });
});

describe('observeServiceWorkerDeepLinks', () => {
  it('routes a synthetic worker message and stops on unsubscribe', () => {
    const target = new EventTarget();
    vi.stubGlobal('navigator', { serviceWorker: target });
    const handler = vi.fn();

    const stop = observeServiceWorkerDeepLinks(handler);
    target.dispatchEvent(message({ type: 'deepLink', deepLink: 'track' }));
    expect(handler).toHaveBeenCalledWith('/track');

    stop();
    target.dispatchEvent(message({ type: 'deepLink', deepLink: '/feed' }));
    expect(handler).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('is inert in a browser with no service worker', () => {
    vi.stubGlobal('navigator', {});
    const handler = vi.fn();
    expect(() => {
      observeServiceWorkerDeepLinks(handler)();
    }).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
