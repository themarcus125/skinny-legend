import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, readThemeChoice, writeThemeChoice, THEME_STORAGE_KEY } from './theme';

const root = () => document.documentElement;

beforeEach(() => {
  root().className = '';
  root().style.colorScheme = '';
  localStorage.clear();
});

describe('applyTheme', () => {
  it('follows the system preference when the choice is system', () => {
    applyTheme('system', root(), true);
    expect(root().classList.contains('dark')).toBe(true);
    applyTheme('system', root(), false);
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('overrides the system preference in both directions', () => {
    applyTheme('dark', root(), false);
    expect(root().classList.contains('dark')).toBe(true);
    applyTheme('light', root(), true);
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('keeps color-scheme in step so native controls flip too', () => {
    applyTheme('dark', root(), false);
    expect(root().style.colorScheme).toBe('dark');
    applyTheme('light', root(), true);
    expect(root().style.colorScheme).toBe('light');
  });
});

describe('readThemeChoice', () => {
  it('defaults to system and round-trips a stored choice', () => {
    expect(readThemeChoice()).toBe('system');
    writeThemeChoice('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemeChoice()).toBe('dark');
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readThemeChoice()).toBe('system');
  });
});
