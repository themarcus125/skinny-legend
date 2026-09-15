import { describe, expect, it, vi } from 'vitest';
import { checkForWorkerUpdates, reloadOnWorkerTakeover } from './sw-update';

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
    const doc: EventTarget & { visibilityState: DocumentVisibilityState } = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
    });
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

  it('asks the registration for an update when the app returns to the foreground', async () => {
    const { update, serviceWorker, doc, win } = harness();
    checkForWorkerUpdates({ serviceWorker }, { document: doc, window: win as unknown as Window });
    await Promise.resolve();

    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);

    // Going *to* the background is not a return.
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('also checks when the connection comes back, and on a timer while resident', async () => {
    const { update, serviceWorker, doc, win, timers } = harness();
    checkForWorkerUpdates({ serviceWorker }, { document: doc, window: win as unknown as Window, intervalMs: 5000 });
    await Promise.resolve();

    win.dispatchEvent(new Event('online'));
    expect(update).toHaveBeenCalledTimes(1);
    expect(win.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    timers[0]!();
    expect(update).toHaveBeenCalledTimes(2);
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
    expect(update).toHaveBeenCalledTimes(1);
    expect(win.clearInterval).toHaveBeenCalledWith(1);
  });

  it('is a no-op in a browser without service workers', () => {
    expect(() => checkForWorkerUpdates({})()).not.toThrow();
  });
});
