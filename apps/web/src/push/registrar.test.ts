import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, DeviceDto, RegisterDeviceInput } from '@skinny/api-client';
import type { UserLocale } from '@skinny/shared/wire';
import type { PushAuthorizing, PushPermission, PushTokenSource } from './ports';
import { permissionFrom } from './ports';
import {
  createPushRegistrar,
  didAskKey,
  ENABLED_KEY,
  PENDING_KEY,
  type PushRegistrar,
  type RegistrarDeps,
} from './registrar';

/**
 * The web half of `ios/SkinnyLegendTests/PushRegistrarTests.swift`, case for case: every Swift
 * test has a counterpart here under the same name, plus the two cases the phone cannot have —
 * a browser with no push support, and a language change while reminders are on.
 */

/** `UserDefaults(suiteName:)` on the web: a fresh, isolated store per registrar. */
class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  get length(): number {
    return this.#map.size;
  }
  clear(): void {
    this.#map.clear();
  }
  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
}

function deferred(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Lets a test wait until the code under test has actually reached the parked call. */
function gate() {
  const parked = deferred();
  const reached = deferred();
  return {
    /** Parks the caller; resolves `reached` first so the test can proceed. */
    async park(): Promise<void> {
      reached.open();
      await parked.promise;
    },
    waitUntilParked: () => reached.promise,
    open: parked.open,
  };
}

function device(body: RegisterDeviceInput): DeviceDto {
  return {
    id: 'dev-1',
    userId: 'u1',
    token: body.token,
    platform: body.platform,
    locale: body.locale,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
  };
}

/** `MockAPIClient`: remembers the rows `POST /me/devices` created and `DELETE` removed. */
class FakeApi {
  readonly rows = new Map<string, RegisterDeviceInput>();
  registerCount = 0;
  deleteCount = 0;
  /** Parks every `registerDevice` until `openRegister()` — the POST-in-flight window. */
  registerGate: ReturnType<typeof gate> | null = null;
  /** `unregisterDevice` never returns: an offline browser, what the deadline exists for. */
  hangDelete = false;

  registerDevice = async (body: RegisterDeviceInput): Promise<DeviceDto> => {
    this.registerCount += 1;
    if (this.registerGate) await this.registerGate.park();
    this.rows.set(body.token, body);
    return device(body);
  };

  unregisterDevice = async (token: string): Promise<void> => {
    this.deleteCount += 1;
    if (this.hangDelete) await new Promise<void>(() => undefined);
    this.rows.delete(token);
    return Promise.resolve();
  };

  tokens(): string[] {
    return [...this.rows.keys()];
  }

  asClient(): ApiClient {
    return this as unknown as ApiClient;
  }
}

interface Harness {
  registrar: PushRegistrar;
  api: FakeApi;
  authorizer: PushAuthorizing & { status: PushPermission; requestCount: number };
  tokens: PushTokenSource & { deleteCount: number };
  storage: Storage;
}

function make(
  options: {
    status?: PushPermission;
    grant?: boolean;
    supported?: boolean;
    /** One answer per call, so a test can play "no token yet, then a token". */
    token?: string | null | (string | null)[];
    tokenGate?: ReturnType<typeof gate>;
    api?: FakeApi;
    storage?: Storage;
    locale?: () => UserLocale;
    signOutDeadlineMs?: number;
  } = {},
): Harness {
  const api = options.api ?? new FakeApi();
  const storage = options.storage ?? new MemoryStorage();
  const queue = Array.isArray(options.token)
    ? [...options.token]
    : [options.token === undefined ? 'fcm-web-token' : options.token];

  const authorizer = {
    status: options.status ?? 'notDetermined',
    requestCount: 0,
    permission: vi.fn(() => Promise.resolve(authorizer.status)),
    requestPermission: vi.fn(() => {
      authorizer.requestCount += 1;
      const granted = options.grant ?? true;
      authorizer.status = granted ? 'authorized' : 'denied';
      return Promise.resolve(granted);
    }),
    isSupported: vi.fn(() => Promise.resolve(options.supported ?? true)),
  };

  const tokens = {
    deleteCount: 0,
    currentToken: vi.fn(async (): Promise<string | null> => {
      // The gate parks only its first caller, so a sign-out's own lookup does not get stuck
      // behind the registration under test — `GatedTokenSource` on iOS.
      if (options.tokenGate) {
        const first = options.tokenGate;
        options.tokenGate = undefined;
        await first.park();
      }
      return queue.length > 1 ? (queue.shift() ?? null) : (queue[0] ?? null);
    }),
    deleteToken: vi.fn(() => {
      tokens.deleteCount += 1;
      return Promise.resolve();
    }),
  };

  const deps: RegistrarDeps = {
    api: api.asClient(),
    authorizer,
    tokens,
    storage,
    locale: options.locale ?? (() => 'vi'),
    signOutDeadlineMs: options.signOutDeadlineMs,
  };
  return { registrar: createPushRegistrar(deps), api, authorizer, tokens, storage };
}

describe('the push registrar', () => {
  it('maps every browser permission value', () => {
    expect(permissionFrom('default')).toBe('notDetermined');
    expect(permissionFrom('granted')).toBe('authorized');
    expect(permissionFrom('denied')).toBe('denied');
  });

  it('enabling asks for permission, then registers the token as platform web', async () => {
    const { registrar, api, authorizer } = make();
    await expect(registrar.enable()).resolves.toBe(true);
    expect(authorizer.requestCount).toBe(1);
    expect(registrar.state.permission).toBe('authorized');
    expect(registrar.state.isEnabled).toBe(true);
    expect(registrar.state.registeredToken).toBe('fcm-web-token');
    expect(api.rows.get('fcm-web-token')).toEqual({
      token: 'fcm-web-token',
      platform: 'web',
      locale: 'vi',
    });
  });

  it('a denied prompt registers nothing and leaves the toggle off', async () => {
    const { registrar, api } = make({ grant: false });
    await expect(registrar.enable()).resolves.toBe(false);
    expect(registrar.state.permission).toBe('denied');
    expect(registrar.state.isEnabled).toBe(false);
    expect(api.tokens()).toEqual([]);
  });

  it('an already-authorized browser registers without prompting again', async () => {
    const { registrar, api, authorizer } = make({ status: 'authorized' });
    await expect(registrar.enable()).resolves.toBe(true);
    expect(authorizer.requestCount).toBe(0);
    expect(api.tokens()).toEqual(['fcm-web-token']);
  });

  it('a token that is not available yet leaves the registration pending, toggle on, no error', async () => {
    const { registrar, api, storage } = make({ token: null });
    await expect(registrar.enable()).resolves.toBe(false);
    expect(registrar.state.isEnabled).toBe(true);
    expect(registrar.state.isRegistrationPending).toBe(true);
    expect(registrar.state.errorKey).toBeNull();
    expect(api.tokens()).toEqual([]);
    expect(storage.getItem(PENDING_KEY)).toBe('1');
  });

  it('the token callback completes a registration that was waiting', async () => {
    const { registrar, api, storage } = make({ token: [null, 'fcm-token-late'] });
    await expect(registrar.enable()).resolves.toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(true);

    await registrar.handleTokenRefresh();

    expect(registrar.state.isEnabled).toBe(true);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.registeredToken).toBe('fcm-token-late');
    expect(registrar.state.errorKey).toBeNull();
    expect(api.tokens()).toEqual(['fcm-token-late']);
    expect(storage.getItem(PENDING_KEY)).toBe('0');
  });

  it('the once-per-user prompt still registers when the token arrives later', async () => {
    const { registrar, api, storage } = make({ token: [null, 'fcm-token-late'] });
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(storage.getItem(didAskKey('u1'))).toBe('1');
    expect(registrar.state.isRegistrationPending).toBe(true);

    await registrar.handleTokenRefresh();
    expect(api.tokens()).toEqual(['fcm-token-late']);
  });

  it('a rotated token never re-registers a browser whose reminders are off', async () => {
    const { registrar, api } = make();
    await registrar.enable();
    await registrar.disable();
    await registrar.handleTokenRefresh();
    expect(registrar.state.isEnabled).toBe(false);
    expect(api.tokens()).toEqual([]);
  });

  it('sign-out deletes the token and clears every install-scoped flag, keeping the per-user asked flag', async () => {
    const { registrar, api, storage } = make();
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(api.tokens()).toEqual(['fcm-web-token']);

    await registrar.resetForSignOut();

    expect(api.tokens()).toEqual([]);
    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.isBusy).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(storage.getItem(didAskKey('u1'))).toBe('1');
    expect(storage.getItem(ENABLED_KEY)).toBe('0');
    expect(storage.getItem(PENDING_KEY)).toBe('0');
  });

  it('sign-out clears local state before its DELETE, so an in-flight registration cannot resurrect it', async () => {
    const tokenGate = gate();
    const { registrar, api, storage } = make({ tokenGate });

    const enabling = registrar.enable();
    await tokenGate.waitUntilParked();
    expect(registrar.state.isEnabled).toBe(true); // intent recorded, token still outstanding

    await registrar.resetForSignOut();
    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(storage.getItem(ENABLED_KEY)).toBe('0');

    tokenGate.open();
    await expect(enabling).resolves.toBe(false);

    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.isBusy).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(registrar.state.errorKey).toBeNull();
    expect(api.tokens()).toEqual([]);
    expect(storage.getItem(PENDING_KEY)).toBe('0');
  });

  it('a POST that lands after sign-out is taken back down and writes no state', async () => {
    const api = new FakeApi();
    api.registerGate = gate();
    const { registrar } = make({ api });

    const enabling = registrar.enable();
    await api.registerGate.waitUntilParked();

    await registrar.resetForSignOut();
    api.registerGate.open();
    await expect(enabling).resolves.toBe(false);

    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(api.registerCount).toBe(1); // no re-POST
    expect(api.tokens()).toEqual([]);
  });

  it('turning reminders off while the POST is in flight wins over the POST', async () => {
    const api = new FakeApi();
    api.registerGate = gate();
    const { registrar } = make({ api });

    const enabling = registrar.enable();
    await api.registerGate.waitUntilParked();
    await registrar.disable();
    api.registerGate.open();
    await expect(enabling).resolves.toBe(false);

    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isBusy).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(api.tokens()).toEqual([]);

    // A rotated token afterwards still respects the OFF.
    await registrar.handleTokenRefresh();
    expect(api.registerCount).toBe(1);
  });

  it('a token callback that resumes after sign-out registers nothing', async () => {
    const storage = new MemoryStorage();
    storage.setItem(ENABLED_KEY, '1');
    storage.setItem(PENDING_KEY, '1');
    const tokenGate = gate();
    const { registrar, api } = make({
      status: 'authorized',
      storage,
      tokenGate,
      token: 'fcm-token-late',
    });
    expect(registrar.state.isRegistrationPending).toBe(true);

    const refreshing = registrar.handleTokenRefresh();
    await tokenGate.waitUntilParked();
    await registrar.resetForSignOut();
    tokenGate.open();
    await refreshing;

    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(api.tokens()).toEqual([]);
  });

  it('sign-out gives up on a DELETE that never returns once the deadline passes', async () => {
    const api = new FakeApi();
    const { registrar, storage } = make({ api, signOutDeadlineMs: 20 });
    await expect(registrar.enable()).resolves.toBe(true);
    api.hangDelete = true;

    const started = Date.now();
    await registrar.resetForSignOut();
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(2000);
    expect(api.deleteCount).toBe(1);
    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.isBusy).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(storage.getItem(ENABLED_KEY)).toBe('0');
  });

  it('a sign-out with nothing registered sends no DELETE at all', async () => {
    const api = new FakeApi();
    api.hangDelete = true;
    const { registrar } = make({ api });
    await registrar.resetForSignOut();
    expect(api.deleteCount).toBe(0);
  });

  it('clearing local state forgets the registration without touching the server', async () => {
    const { registrar, api, storage } = make();
    await expect(registrar.enable()).resolves.toBe(true);

    registrar.clearLocalState();

    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(storage.getItem(ENABLED_KEY)).toBe('0');
    expect(storage.getItem(PENDING_KEY)).toBe('0');
    expect(api.tokens()).toEqual(['fcm-web-token']); // the row is the server's to drop

    // And it invalidates whatever was in flight: a later callback must not re-register.
    await registrar.handleTokenRefresh();
    expect(registrar.state.isEnabled).toBe(false);
  });

  it('a returning member who turned reminders off stays off, a new account is asked afresh', async () => {
    const { registrar, api, authorizer, storage } = make();
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(authorizer.requestCount).toBe(1);
    await registrar.disable(); // an explicit OFF
    await registrar.resetForSignOut();
    expect(storage.getItem(didAskKey('u1'))).toBe('1');

    // u1 signs back in and confirms another entry: not re-enabled.
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(registrar.state.isEnabled).toBe(false);
    expect(api.tokens()).toEqual([]);

    // A different account in the same browser is asked afresh.
    await registrar.requestAfterFirstConfirmedEntry('u2');
    expect(storage.getItem(didAskKey('u2'))).toBe('1');
    expect(registrar.state.isEnabled).toBe(true);
    expect(api.tokens()).toEqual(['fcm-web-token']);
  });

  it('disabling unregisters the token, revokes it with FCM and clears the flag', async () => {
    const { registrar, api, tokens, storage } = make();
    await registrar.enable();
    await registrar.disable();
    expect(registrar.state.isEnabled).toBe(false);
    expect(registrar.state.registeredToken).toBeNull();
    expect(api.tokens()).toEqual([]);
    expect(tokens.deleteCount).toBe(1);
    expect(storage.getItem(ENABLED_KEY)).toBe('0');
  });

  it('refresh turns the toggle off when permission was revoked in the browser', async () => {
    const { registrar, authorizer } = make({ status: 'authorized' });
    await registrar.enable();
    authorizer.status = 'denied';
    await registrar.refresh();
    expect(registrar.state.permission).toBe('denied');
    expect(registrar.state.isEnabled).toBe(false);
  });

  it('a refreshed token re-registers on a reload, before anything read the browser setting', async () => {
    const { registrar, api, authorizer } = make({ status: 'authorized' });
    expect(registrar.state.permission).toBe('unknown');
    await expect(registrar.registerCurrentToken()).resolves.toBe(true);
    expect(authorizer.requestCount).toBe(0);
    expect(api.tokens()).toEqual(['fcm-web-token']);
  });

  it('the post-first-entry prompt runs at most once per user id', async () => {
    const { registrar, authorizer, storage } = make();
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(authorizer.requestCount).toBe(1);
    expect(storage.getItem(didAskKey('u1'))).toBe('1');

    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(authorizer.requestCount).toBe(1);
  });

  it('a registrar built on storage that already asked never prompts again', async () => {
    const storage = new MemoryStorage();
    storage.setItem(didAskKey('u1'), '1');
    const { registrar, authorizer } = make({ storage });
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(authorizer.requestCount).toBe(0);
  });

  it('a member who already turned notifications off is not re-prompted by a later entry', async () => {
    const { registrar, api, authorizer } = make({ grant: false });
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(authorizer.requestCount).toBe(1);
    expect(registrar.state.isEnabled).toBe(false);

    // A second confirmed entry must not nag.
    await registrar.requestAfterFirstConfirmedEntry('u1');
    expect(authorizer.requestCount).toBe(1);
    expect(api.tokens()).toEqual([]);
  });

  it('re-enabling after a denial does not register, so the row can explain why', async () => {
    const { registrar, api, authorizer } = make({ status: 'denied' });
    await expect(registrar.enable()).resolves.toBe(false);
    expect(registrar.state.permission).toBe('denied');
    expect(authorizer.requestCount).toBe(0);
    expect(api.tokens()).toEqual([]);
  });

  it('reports unsupported without prompting when the browser has no push support', async () => {
    const { registrar, authorizer, api } = make({ supported: false });
    await registrar.refresh();
    expect(registrar.state.permission).toBe('unsupported');
    expect(authorizer.requestCount).toBe(0);

    await expect(registrar.enable()).resolves.toBe(false);
    expect(authorizer.requestCount).toBe(0);
    expect(api.tokens()).toEqual([]);
  });

  it('refresh retries a registration left pending, once a token can be minted', async () => {
    const { registrar, api } = make({ token: [null, 'fcm-token-late'] });
    await expect(registrar.enable()).resolves.toBe(false);
    expect(registrar.state.isRegistrationPending).toBe(true);
    expect(api.registerCount).toBe(0);

    // The web has no token callback, so the next deliberate re-read is the retry.
    await registrar.refresh();

    expect(registrar.state.isRegistrationPending).toBe(false);
    expect(registrar.state.registeredToken).toBe('fcm-token-late');
    expect(api.tokens()).toEqual(['fcm-token-late']);
  });

  it('a retry that still cannot mint a token stays pending without looping', async () => {
    const { registrar, api, tokens } = make({ token: null });
    await registrar.enable();
    const lookups = (tokens.currentToken as unknown as { mock: { calls: unknown[] } }).mock.calls
      .length;

    await registrar.refresh();

    expect(registrar.state.isRegistrationPending).toBe(true);
    expect(registrar.state.errorKey).toBeNull();
    expect(api.registerCount).toBe(0);
    // Exactly one more attempt, not a refresh → register → refresh cascade.
    expect(
      (tokens.currentToken as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(lookups + 1);
  });

  it('turning reminders off before any token existed sends nothing and mints nothing', async () => {
    const { registrar, api, tokens } = make({ token: null });
    await registrar.enable();
    expect(registrar.state.isRegistrationPending).toBe(true);
    const lookups = (tokens.currentToken as unknown as { mock: { calls: unknown[] } }).mock.calls
      .length;

    await registrar.disable();

    expect(registrar.state.isEnabled).toBe(false);
    expect(api.deleteCount).toBe(0);
    // No second token lookup: asking for one would register the FCM service worker to mint a
    // token purely to throw it away.
    expect(
      (tokens.currentToken as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(lookups);
  });

  it('re-registers with the new locale when the language changes while enabled', async () => {
    let locale: UserLocale = 'vi';
    const { registrar, api } = make({ locale: () => locale });
    await expect(registrar.enable()).resolves.toBe(true);
    expect(api.rows.get('fcm-web-token')?.locale).toBe('vi');

    locale = 'en';
    await expect(registrar.registerCurrentToken()).resolves.toBe(true);
    expect(api.rows.get('fcm-web-token')?.locale).toBe('en');
    expect(api.registerCount).toBe(2);
  });

  it('notifies subscribers as the state moves, and stops after the unsubscribe', async () => {
    const { registrar } = make();
    const listener = vi.fn();
    const unsubscribe = registrar.subscribe(listener);
    await registrar.enable();
    expect(listener).toHaveBeenCalled();
    const seen = listener.mock.calls.length;
    unsubscribe();
    await registrar.disable();
    expect(listener.mock.calls.length).toBe(seen);
  });
});
