import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `specs/` is Playwright's, and running it here would start the paid suite's browsers.
    // Vitest only ever owns the pure unit tests under `test/`.
    include: ['test/**/*.test.ts'],
  },
});
