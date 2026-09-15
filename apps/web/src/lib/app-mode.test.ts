import { describe, expect, it } from 'vitest';
import { MOCK_OVERRIDE_KEY, readMockOverride, resolveServices, writeMockOverride } from './app-mode';

describe('resolveServices', () => {
  const live = { envIsMock: false, mockOverride: false, hasFirebaseConfig: true };

  it('runs live with a Firebase config and neither mock signal', () => {
    expect(resolveServices(live)).toBe('live');
  });

  it('lets VITE_MOCK win even when Firebase is configured', () => {
    expect(resolveServices({ ...live, envIsMock: true })).toBe('mock');
  });

  it('lets the sample-data override win on its own', () => {
    expect(resolveServices({ ...live, mockOverride: true })).toBe('mock');
  });

  it('stays mock when VITE_MOCK is set and no Firebase config exists', () => {
    expect(
      resolveServices({ envIsMock: true, mockOverride: false, hasFirebaseConfig: false }),
    ).toBe('mock');
  });

  it('falls back to the mock without a Firebase config rather than booting an unconfigured app', () => {
    expect(resolveServices({ ...live, hasFirebaseConfig: false })).toBe('mock');
  });

  it('cannot be forced back to live by clearing only the override', () => {
    expect(
      resolveServices({ envIsMock: true, mockOverride: false, hasFirebaseConfig: true }),
    ).toBe('mock');
  });
});

describe('the sample-data override', () => {
  it('round-trips through storage under the documented key', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage;

    expect(readMockOverride(storage)).toBe(false);
    writeMockOverride(true, storage);
    expect(store.get(MOCK_OVERRIDE_KEY)).toBe('1');
    expect(readMockOverride(storage)).toBe(true);
    writeMockOverride(false, storage);
    expect(readMockOverride(storage)).toBe(false);
  });

  it('reads false rather than throwing when storage is blocked', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;

    expect(readMockOverride(storage)).toBe(false);
    expect(() => writeMockOverride(true, storage)).not.toThrow();
  });
});
