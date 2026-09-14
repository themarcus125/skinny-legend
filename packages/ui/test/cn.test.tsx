import { describe, it, expect } from 'vitest';
import { cn } from '../src/index';

describe('cn', () => {
  it('joins the truthy classes with a single space', () => {
    expect(cn('a', 'b')).toBe('a b');
  });
  it('drops false, null and undefined branches', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
  it('is empty when nothing applies', () => {
    expect(cn(false, undefined)).toBe('');
  });
});
