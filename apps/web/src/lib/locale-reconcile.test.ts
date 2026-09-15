import { describe, expect, it } from 'vitest';
import { reconcileLocale } from './locale-reconcile';

const base = {
  choice: 'system' as const,
  deviceLanguage: 'vi-VN',
  serverLocale: 'vi' as const,
  userStatus: 'active' as const,
  isFreshInstall: false,
};

describe('reconcileLocale', () => {
  it('pushes an explicit local choice when the server disagrees', () => {
    expect(reconcileLocale({ ...base, choice: 'en' })).toEqual({ store: 'en', push: 'en' });
  });

  it('pushes nothing when the explicit choice already matches the server', () => {
    expect(reconcileLocale({ ...base, choice: 'vi' })).toEqual({ store: 'vi', push: null });
  });

  it('adopts an explicit server value while the local choice is system', () => {
    expect(reconcileLocale({ ...base, serverLocale: 'en' })).toEqual({ store: 'en', push: null });
  });

  it('pushes the device-resolved language on a fresh install and stores system', () => {
    expect(
      reconcileLocale({
        ...base,
        deviceLanguage: 'en-GB',
        serverLocale: 'vi',
        isFreshInstall: true,
      }),
    ).toEqual({ store: 'system', push: 'en' });
  });

  it('falls back to Vietnamese for a device language the app does not ship', () => {
    expect(
      reconcileLocale({
        ...base,
        deviceLanguage: 'fr-FR',
        serverLocale: 'en',
        isFreshInstall: true,
      }),
    ).toEqual({ store: 'system', push: 'vi' });
  });

  it('pushes nothing on a fresh install when the device already agrees with the server', () => {
    expect(
      reconcileLocale({ ...base, deviceLanguage: 'vi-VN', serverLocale: 'vi', isFreshInstall: true }),
    ).toEqual({ store: 'system', push: null });
  });

  it('never pushes for a disabled account', () => {
    expect(reconcileLocale({ ...base, choice: 'en', userStatus: 'disabled' })).toEqual({
      store: 'en',
      push: null,
    });
  });

  it('does not push on a fresh install for a disabled account either', () => {
    expect(
      reconcileLocale({ ...base, deviceLanguage: 'en-GB', isFreshInstall: true, userStatus: 'disabled' }),
    ).toEqual({ store: 'system', push: null });
  });

  it('leaves a pending account free to push — only disabled is blocked by the API', () => {
    expect(reconcileLocale({ ...base, choice: 'en', userStatus: 'pending' })).toEqual({
      store: 'en',
      push: 'en',
    });
  });
});
