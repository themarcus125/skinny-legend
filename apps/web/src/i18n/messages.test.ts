import { describe, it, expect } from 'vitest';
import { describeError, ApiError } from '@skinny/api-client';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import webOnly from '../../messages/web-only.json';

/** Flattens { a: { b: 'x' } } to ['a.b'] so nesting differences show up as missing keys. */
function paths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const read = (source: unknown, path: string) =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], source);

/** `{0}`, `{1}`, … in a message, sorted — the two catalogs must format identically. */
const placeholders = (value: unknown) =>
  [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('message catalogues', () => {
  it('have identical key sets', () => {
    expect(paths(en).sort()).toEqual(paths(vi).sort());
  });

  it('have no empty values', () => {
    const empties = [
      ...paths(vi).filter((path) => String(read(vi, path)).trim() === ''),
      ...paths(en).filter((path) => String(read(en, path)).trim() === ''),
    ];
    expect(empties).toEqual([]);
  });

  it('never reuse the Vietnamese string as the English one', () => {
    const properNouns = new Set([
      'Skinny Legend',
      // The sign-in wordmark, set over two lines. A brand name, identical in both languages.
      'Operation\nSkinny Legend',
      'Momo',
      'Google',
      // Vietnamese borrows the word wholesale; the emulator form's field label is "Email" in
      // both catalogues.
      'Email',
      'Strava',
      'Tiếng Việt',
      'English',
      'AI',
      'iOS',
      'Web',
    ]);
    const echoes = paths(vi).filter((path) => {
      const viValue = read(vi, path);
      return typeof viValue === 'string' && read(en, path) === viValue && !properNouns.has(viValue);
    });
    expect(echoes).toEqual([]);
  });

  it('use the same ICU placeholders on both sides', () => {
    const mismatched = paths(vi).filter(
      (path) => placeholders(read(vi, path)).join() !== placeholders(read(en, path)).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('covers every key the seed script could not translate', () => {
    const overrides = webOnly as Record<string, { vi: string; en: string }>;
    const missing = paths(vi).filter((path) => read(en, path) === undefined);
    expect(missing).toEqual([]);
    // Every override is anchored to a real key, and its Vietnamese still matches vi.json — the
    // seed script enforces both, and this keeps the guarantee visible in the suite.
    expect(Object.keys(overrides).filter((key) => !paths(vi).includes(key))).toEqual([]);
    expect(
      Object.entries(overrides).filter(([key, pair]) => read(vi, key) !== pair.vi).map(([key]) => key),
    ).toEqual([]);
  });

  it('carries every key describeError can return', () => {
    // The contract for Tasks 5–14: 14 API codes + `upload_failed`, plus the offline/fallback
    // keys describeError produces without an ApiError at all.
    const codes = [
      'unauthenticated',
      'forbidden',
      'pending_approval',
      'disabled',
      'invalid_body',
      'not_found',
      'internal',
      'no_challenge',
      'photo_missing',
      'photo_invalid',
      'taken_at_future',
      'upload_failed',
      'no_device_tokens',
      'push_failed',
    ];
    const keys = [
      ...codes.map((code) => describeError(new ApiError(400, code, code))),
      describeError(new TypeError('offline')),
      describeError(new Error('anything else')),
    ];
    expect(new Set(keys).size).toBe(codes.length + 2);
    expect(keys.filter((key) => read(vi, key) === undefined)).toEqual([]);
    expect(keys.filter((key) => read(en, key) === undefined)).toEqual([]);
  });
});
