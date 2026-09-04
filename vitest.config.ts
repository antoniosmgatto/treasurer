import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // PGlite boots a Postgres per test; the default 5s is tight on a cold cache.
    testTimeout: 20_000,
  },
});
