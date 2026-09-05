import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * Absolute, because the two processes that touch it do not share a working directory: the CLI
 * migrates from the repository root and `next dev` runs inside `apps/web`. A relative path here
 * quietly gives them one database each, and the server then reports a schema that was never built.
 */
const DATABASE = fileURLToPath(new URL('.data/e2e', import.meta.url));

/**
 * One browser, one worker, one throwaway database.
 *
 * The engine and the repository are covered to the cent by vitest; what nothing covered until now
 * is the path a person actually takes — the screens, the server actions between them, and the link
 * that ends up in the group chat. That is one test, and it is slow by nature, so it is kept out of
 * `pnpm test` and run as `pnpm e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  // Every step is a server action against a single-writer database, so parallelism buys nothing
  // and a second browser is another few hundred megabytes for no coverage.
  workers: 1,
  fullyParallel: false,
  // Fifteen members and three bills are entered one form at a time; the whole run is one journey.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? 'github' : 'list',
  forbidOnly: !!process.env['CI'],
  retries: 0,
  use: {
    // `localhost`, not `127.0.0.1`: Next's dev server treats a different origin as cross-origin and
    // refuses the HMR socket, and a page whose React never connects never hydrates — so a button in
    // a client component does nothing and the failure looks like a missing element.
    baseURL: 'http://localhost:3100',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    /**
     * Three commands in one line, and the order is the whole point. The database is thrown away
     * and migrated *before* the server opens it: PGlite is single-writer, so a wipe or a migration
     * anywhere else would race an app that already holds the file.
     *
     * `next dev` rather than `next start`, which is not a preference. D21 makes `connect()` throw
     * when `NODE_ENV=production` and no `DATABASE_URL` is set — the guard that stops a deployment
     * from writing a ledger to a filesystem Vercel throws away — and `next start` sets exactly that.
     * The file-backed database is what keeps this runnable with no container and no credentials,
     * so the dev server is the price of it.
     */
    command: `rm -rf ${DATABASE} && node packages/cli/dist/cli.js migrate && pnpm --filter @treasurer/web exec next dev --port 3100`,
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      /**
       * D21: with no `DATABASE_URL` the app falls back to a Postgres in a file, so this needs no
       * container and no credentials — the same bargain the vitest suite makes with PGlite. The
       * path is thrown away and recreated per run, and it is deliberately not `.data/treasurer`:
       * a test must never be able to write to the database somebody develops against.
       */
      DATABASE_URL: '',
      PGLITE_PATH: DATABASE,
      /** D34: the gate is part of the path now, so the test walks through it rather than around. */
      PANEL_PASSPHRASE: 'senha do teste ponta a ponta',
      /** A build directory of its own, so this can run while `pnpm dev` is open. */
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
});
