import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every helper here reaches for a real port, database or emulator; serial keeps them honest.
    fileParallelism: false,
  },
});
