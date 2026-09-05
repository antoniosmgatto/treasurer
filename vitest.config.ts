import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The web app's own `@/` alias, so a test can import a lib module the way the app does.
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) } },
  test: {
    // apps/web has no test setup of its own: the one thing in it worth testing without a server
    // is the gate's arithmetic (D34), which is deliberately free of Next imports.
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
    // PGlite boots a Postgres per test; the default 5s is tight on a cold cache.
    testTimeout: 20_000,
    // Each fork carries its own PGlite Postgres, measured at ~1.9GB resident, so the
    // pool size sets the memory ceiling directly. Two keeps the peak near 4GB; sized to
    // the CPU count instead, this suite would ask for far more than a laptop has.
    poolOptions: { forks: { maxForks: 2 } },
  },
});
