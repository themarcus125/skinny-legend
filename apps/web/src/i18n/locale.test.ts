import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  isFreshInstall,
  readLocaleChoice,
  resolveLocale,
  writeLocaleChoice,
} from './locale';

beforeEach(() => localStorage.clear());

describe('resolveLocale', () => {
  it('follows the browser only for the system choice', () => {
    expect(resolveLocale('system', 'en-GB')).toBe('en');
    expect(resolveLocale('system', 'vi-VN')).toBe('vi');
    // Anything the app does not ship falls back to Vietnamese, like iOS AppLocale.
    expect(resolveLocale('system', 'fr-FR')).toBe('vi');
    expect(resolveLocale('system', undefined)).toBe('vi');
  });

  it('ignores the browser when the choice is explicit', () => {
    expect(resolveLocale('vi', 'en-US')).toBe('vi');
    expect(resolveLocale('en', 'vi-VN')).toBe('en');
  });
});

describe('readLocaleChoice', () => {
  it('defaults to system and round-trips a stored choice', () => {
    expect(readLocaleChoice()).toBe('system');
    writeLocaleChoice('en');
    expect(readLocaleChoice()).toBe('en');
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon');
    expect(readLocaleChoice()).toBe('system');
  });
});

describe('isFreshInstall', () => {
  it('is true until a choice — including "system" — has been stored', () => {
    expect(isFreshInstall()).toBe(true);
    writeLocaleChoice('system');
    expect(isFreshInstall()).toBe(false);
  });
});
