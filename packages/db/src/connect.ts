import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Db } from './repository.js';

/**
 * Production points at Neon through DATABASE_URL. Development without one falls back to PGlite on
 * disk, so the app runs with no service to sign up for and no connection string to leak.
 */
export async function connect(url = process.env['DATABASE_URL']): Promise<Db> {
  if (url) {
    return drizzlePg(postgres(url, { prepare: false })) as unknown as Db;
  }

  // The fallback is a development convenience and a terrible deployment. A serverless filesystem
  // is ephemeral, so writes would appear to succeed and then vanish between invocations — worse
  // than not starting. If somewhere claims to be deployed, insist on a real database.
  if (process.env['VERCEL'] || process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'DATABASE_URL is not set. Deployments need a real Postgres; the PGlite fallback is for local development only.',
    );
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { mkdirSync } = await import('node:fs');

  const directory = process.env['PGLITE_PATH'] ?? '.data/treasurer';
  mkdirSync(directory, { recursive: true });
  return drizzle(new PGlite(directory)) as unknown as Db;
}
