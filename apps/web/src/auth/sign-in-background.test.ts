import { describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, signInBackgroundMode } from './sign-in-background';

describe('signInBackgroundMode', () => {
  it('plays video when motion is allowed and the asset exists', () => {
    expect(signInBackgroundMode({ reduceMotion: false, assetAvailable: true })).toBe('video');
  });

  it('falls back to the gradient under reduced motion', () => {
    expect(signInBackgroundMode({ reduceMotion: true, assetAvailable: true })).toBe('gradient');
  });

  it('falls back to the gradient when the asset is missing or failed', () => {
    expect(signInBackgroundMode({ reduceMotion: false, assetAvailable: false })).toBe('gradient');
  });
});

describe('prefersReducedMotion', () => {
  it('reads the reduced-motion media query', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('reduced-motion'), media: query })),
    );
    expect(prefersReducedMotion()).toBe(true);
  });
});
