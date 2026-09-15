import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * jsdom ships no `matchMedia`. The theme module asks it for `prefers-color-scheme`, so give
 * every test a light-mode stub; a test that cares overrides it.
 */
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

/**
 * jsdom implements no media pipeline, so `play()` logs "Not implemented" to the virtual console
 * on every sign-in render. The sign-in screen already treats a rejection as "fall back to the
 * gradient"; a resolved stub keeps the video path under test and the output readable.
 */
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
