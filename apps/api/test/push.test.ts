import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEach = vi.fn();
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEach }) }));
vi.mock('../src/services/firebase.js', () => ({ firebaseApp: () => ({ name: 'test' }) }));

const { fakeSender, fcmSender, pushSender, hasFirebaseCredentials, localeFor } = await import('../src/services/push.js');
type FakeSender = ReturnType<typeof fakeSender>;

const message = (token: string) => ({ token, title: 'T', body: 'B', data: { deepLink: 'track' } });

beforeEach(() => sendEach.mockReset());

describe('fakeSender', () => {
  it('records every message and reports success', async () => {
    const sender = fakeSender();
    const results = await sender.send([message('a'), message('b')]);
    expect(results).toEqual([
      { token: 'a', ok: true, unregistered: false },
      { token: 'b', ok: true, unregistered: false },
    ]);
    expect(sender.sent.map((m) => m.token)).toEqual(['a', 'b']);
  });

  it('fails only the tokens configured to fail, and flags unregistered ones', async () => {
    const sender = fakeSender();
    sender.failures.set('dead', { unregistered: true, error: 'gone' });
    const results = await sender.send([message('live'), message('dead')]);
    expect(results).toEqual([
      { token: 'live', ok: true, unregistered: false },
      { token: 'dead', ok: false, unregistered: true, error: 'gone' },
    ]);
    expect(sender.sent.map((m) => m.token)).toEqual(['live']);
  });

  it('reset clears both the outbox and the configured failures', async () => {
    const sender = fakeSender();
    sender.failures.set('dead', { unregistered: true, error: 'gone' });
    await sender.send([message('a')]);
    sender.reset();
    expect(sender.sent).toEqual([]);
    expect(sender.failures.size).toBe(0);
  });
});

describe('fcmSender', () => {
  it('maps every message onto one sendEach multicast call', async () => {
    sendEach.mockResolvedValue({ responses: [{ success: true }] });
    await fcmSender().send([message('tok')]);
    expect(sendEach).toHaveBeenCalledTimes(1);
    expect(sendEach.mock.calls[0]![0]).toEqual([
      {
        token: 'tok',
        notification: { title: 'T', body: 'B' },
        data: { deepLink: 'track' },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    ]);
  });

  it('sends a web token data-only, with the copy folded into data', async () => {
    // A `notification` block would make the Firebase JS SDK present its own (iconless, dead-tap)
    // notification *and* still wake firebase-messaging-sw.js, which shows a second one.
    sendEach.mockResolvedValue({ responses: [{ success: true }] });
    await fcmSender().send([{ ...message('web-tok'), platform: 'web' }]);
    expect(sendEach.mock.calls[0]![0]).toEqual([
      { token: 'web-tok', data: { deepLink: 'track', title: 'T', body: 'B' } },
    ]);
  });

  it('keeps the APNs notification shape for an explicit ios token', async () => {
    sendEach.mockResolvedValue({ responses: [{ success: true }] });
    await fcmSender().send([{ ...message('ios-tok'), platform: 'ios' }]);
    expect(sendEach.mock.calls[0]![0]).toEqual([
      {
        token: 'ios-tok',
        notification: { title: 'T', body: 'B' },
        data: { deepLink: 'track' },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    ]);
  });

  it('flags messaging/registration-token-not-registered as unregistered', async () => {
    sendEach.mockResolvedValue({
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'gone' } },
        { success: false, error: { code: 'messaging/internal-error', message: 'oops' } },
        { success: true },
      ],
    });
    const results = await fcmSender().send([message('dead'), message('flaky'), message('good')]);
    expect(results).toEqual([
      { token: 'dead', ok: false, unregistered: true, error: 'gone' },
      { token: 'flaky', ok: false, unregistered: false, error: 'oops' },
      { token: 'good', ok: true, unregistered: false, error: undefined },
    ]);
  });

  it('never calls FCM with an empty batch', async () => {
    expect(await fcmSender().send([])).toEqual([]);
    expect(sendEach).not.toHaveBeenCalled();
  });
});

describe('sender selection', () => {
  it('uses the fake sender when no Firebase credentials are configured', async () => {
    // The test suite runs with AUTH_MODE=test (vitest.config.ts), so hasFirebaseCredentials
    // (gated on env.AUTH_MODE === 'firebase' per the push preflight ruling) is false here.
    expect(hasFirebaseCredentials).toBe(false);
    const fake = pushSender as FakeSender;
    fake.reset();
    await pushSender.send([message('x')]);
    expect(fake.sent.map((m) => m.token)).toEqual(['x']);
  });
});

describe('localeFor', () => {
  it('defaults to vi when there are no devices', () => {
    expect(localeFor([])).toBe('vi');
  });

  it('uses the most recently seen device locale', () => {
    const devices = [
      { locale: 'vi' as const, lastSeenAt: new Date('2026-09-01T00:00:00Z') },
      { locale: 'en' as const, lastSeenAt: new Date('2026-09-10T00:00:00Z') },
    ];
    expect(localeFor(devices)).toBe('en');
  });

  it('is stable for a single device', () => {
    expect(localeFor([{ locale: 'en' as const, lastSeenAt: new Date() }])).toBe('en');
  });
});
