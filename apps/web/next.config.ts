import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * The database package reads migration SQL from disk and loads PGlite's wasm at runtime, neither
   * of which survives bundling. Keep them as real Node modules on the server.
   */
  serverExternalPackages: ['@treasurer/db', '@electric-sql/pglite', 'postgres'],

  /**
   * Static generation forks one worker per core. Six routes do not need ten of them, and an
   * unbounded fan-out is what turns a build problem into an unresponsive machine.
   */
  experimental: { cpus: 2 },

  /**
   * `.next` everywhere except the end-to-end run, which sets this to a directory of its own. Next
   * refuses a second dev server for the same build directory, so without this `pnpm e2e` would
   * fail whenever `pnpm dev` happened to be open — which is most of the time.
   */
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
};

export default nextConfig;
