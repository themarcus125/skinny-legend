import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { AUTH_MODE: 'test' },
    fileParallelism: false,
  },
});
