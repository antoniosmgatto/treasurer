import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // PGlite boots a Postgres per test; the default 5s is tight on a cold cache.
    testTimeout: 20_000,
    // Each fork carries its own PGlite Postgres, measured at ~1.9GB resident, so the
    // pool size sets the memory ceiling directly. Two keeps the peak near 4GB; sized to
    // the CPU count instead, this suite would ask for far more than a laptop has.
    poolOptions: { forks: { maxForks: 2 } },
  },
});
