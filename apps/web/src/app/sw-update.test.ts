import { describe, expect, it, vi } from 'vitest';
import { reloadOnWorkerTakeover } from './sw-update';

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
