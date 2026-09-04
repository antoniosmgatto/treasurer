import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * The database package reads migration SQL from disk and loads PGlite's wasm at runtime, neither
   * of which survives bundling. Keep them as real Node modules on the server.
   */
  serverExternalPackages: ['@treasurer/db', '@electric-sql/pglite', 'postgres'],
};

export default nextConfig;
