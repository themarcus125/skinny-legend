import { describe, expect, it, vi } from 'vitest';
import { checkForWorkerUpdates, recoverFromStaleWorker, reloadOnWorkerTakeover } from './sw-update';

/** Enough of `ServiceWorkerContainer` for the listener: the controller, and the event target. */
function container(controller: object | null) {
  const target = new EventTarget();
  return {
    serviceWorker: Object.assign(target, { controller }) as unknown as ServiceWorkerContainer,
    takeOver: () => target.dispatchEvent(new Event('controllerchange')),
  };
}

describe('reloadOnWorkerTakeover', () => {
  it('reloads when a new worker claims a page that already had one', () => {
    const reload = vi.fn();
    const { serviceWorker, takeOver } = container({});

    reloadOnWorkerTakeover({ serviceWorker }, reload);
    takeOver();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on a first install, where the first claim is this page being adopted', () => {
    const reload = vi.fn();
    const { serviceWorker, takeOver } = container(null);

    reloadOnWorkerTakeover({ serviceWorker }, reload);
    takeOver();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at most once, and not after it is detached', () => {
    const reload = vi.fn();
    const { serviceWorker, takeOver } = container({});

    const stop = reloadOnWorkerTakeover({ serviceWorker }, reload);
    takeOver();
    takeOver();
    stop();
    takeOver();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is inert in a browser with no service worker at all', () => {
    const reload = vi.fn();
    expect(() => {
      reloadOnWorkerTakeover({}, reload)();
    }).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('checkForWorkerUpdates', () => {
  /** A registration whose `update()` is countable, behind a `ready` that resolves at once. */
  function harness() {
    const update = vi.fn(() => Promise.resolve());
    const registration = { update } as unknown as ServiceWorkerRegistration;
    const serviceWorker = { ready: Promise.resolve(registration) } as unknown as ServiceWorkerContainer;
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    const timers: Array<() => void> = [];
    const win = Object.assign(new EventTarget(), {
      setInterval: vi.fn((handler: () => void) => {
        timers.push(handler);
        return 1;
      }),
      clearInterval: vi.fn(),
    });
    return { update, serviceWorker, doc, win, timers };
  }

  it('checks once as soon as the registration is ready, then on every return to the foreground', async () => {
    const { update, serviceWorker, doc, win } = harness();
    checkForWorkerUpdates({ serviceWorker }, { document: doc, window: win as unknown as Window });
    await Promise.resolve();
    // The boot-time check: WebKit will not look for a new worker on a reload by itself.
    expect(update).toHaveBeenCalledTimes(1);

    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);

    // Going *to* the background is not a return.
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('also checks when the connection comes back, and on a timer while resident', async () => {
    const { update, serviceWorker, doc, win, timers } = harness();
    checkForWorkerUpdates({ serviceWorker }, { document: doc, window: win as unknown as Window, intervalMs: 5000 });
    await Promise.resolve();

    win.dispatchEvent(new Event('online'));
    expect(update).toHaveBeenCalledTimes(2);
    expect(win.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    timers[0]!();
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('swallows a failed check and stops listening once detached', async () => {
    const { update, serviceWorker, doc, win } = harness();
    update.mockRejectedValue(new Error('offline'));
    const stop = checkForWorkerUpdates({ serviceWorker }, { document: doc, window: win as unknown as Window });
    await Promise.resolve();
    doc.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    stop();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);
    expect(win.clearInterval).toHaveBeenCalledWith(1);
  });

  it('is a no-op in a browser without service workers', () => {
    expect(() => checkForWorkerUpdates({})()).not.toThrow();
  });
});

describe('recoverFromStaleWorker', () => {
  function harness(options: { takeover?: boolean } = {}) {
    const update = vi.fn(() => Promise.resolve());
    const unregister = vi.fn(() => Promise.resolve(true));
    const registration = { update, unregister } as unknown as ServiceWorkerRegistration;
    const target = new EventTarget();
    const serviceWorker = Object.assign(target, {
      controller: {},
      getRegistration: vi.fn(() => Promise.resolve(registration)),
      getRegistrations: vi.fn(() => Promise.resolve([registration])),
    }) as unknown as ServiceWorkerContainer;
    const deleted: string[] = [];
    const caches = {
      keys: vi.fn(() => Promise.resolve(['workbox-precache-v2', 'thumbs'])),
      delete: vi.fn((key: string) => {
        deleted.push(key);
        return Promise.resolve(true);
      }),
    };
    const reload = vi.fn();
    // The wait is where a new worker would claim the page; the harness decides whether one does.
    const wait = vi.fn(() => {
      if (options.takeover) target.dispatchEvent(new Event('controllerchange'));
      return Promise.resolve();
    });
    return { update, unregister, serviceWorker, caches, deleted, reload, wait };
  }

  it('asks for an update and leaves the takeover reload to do the rest when a new worker arrives', async () => {
    const { update, unregister, serviceWorker, caches, reload, wait } = harness({ takeover: true });
    const result = await recoverFromStaleWorker({ serviceWorker }, { caches, reload, wait });
    expect(result).toBe('takeover');
    expect(update).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('otherwise drops every worker and cache and reloads from the network', async () => {
    const { update, unregister, serviceWorker, caches, deleted, reload, wait } = harness();
    const result = await recoverFromStaleWorker({ serviceWorker }, { caches, reload, wait });
    expect(result).toBe('reset');
    expect(update).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual(['workbox-precache-v2', 'thumbs']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the update check itself blows up', async () => {
    const { serviceWorker, caches, reload, wait } = harness();
    (serviceWorker.getRegistration as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    await recoverFromStaleWorker({ serviceWorker }, { caches, reload, wait });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('just reloads in a browser without service workers', async () => {
    const reload = vi.fn();
    expect(await recoverFromStaleWorker({}, { reload })).toBe('reset');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
