import { describe, it, expect } from 'vitest';
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale } from './locale';

describe('parseLocale', () => {
  it('accepts the two supported locales', () => {
    expect(parseLocale('vi')).toBe('vi');
    expect(parseLocale('en')).toBe('en');
  });

  it('falls back to Vietnamese for anything else', () => {
    expect(parseLocale('fr')).toBe('vi');
    expect(parseLocale('')).toBe('vi');
    expect(parseLocale(undefined)).toBe('vi');
  });

  it('exposes the cookie name and the default', () => {
    expect(LOCALE_COOKIE).toBe('locale');
    expect(DEFAULT_LOCALE).toBe('vi');
  });
});
