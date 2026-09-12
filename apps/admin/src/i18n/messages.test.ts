import { describe, it, expect } from 'vitest';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';

/** Flattens { a: { b: 'x' } } to ['a.b'] so nesting differences show up as missing keys. */
function paths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogues', () => {
  it('have identical key sets', () => {
    expect(paths(en).sort()).toEqual(paths(vi).sort());
  });

  it('have no empty values', () => {
    const empties = paths(vi).concat(paths(en)).filter((path) => path.endsWith('.'));
    expect(empties).toEqual([]);
  });

  it('never reuse the Vietnamese string as the English one', () => {
    const properNouns = new Set(['Skinny Legend', 'Momo', 'Google', 'Strava', 'Tiếng Việt', 'English', 'AI']);
    const read = (source: unknown, path: string) =>
      path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], source) as string;
    const echoes = paths(vi).filter((path) => {
      const viValue = read(vi, path);
      return typeof viValue === 'string' && read(en, path) === viValue && !properNouns.has(viValue);
    });
    expect(echoes).toEqual([]);
  });
});
