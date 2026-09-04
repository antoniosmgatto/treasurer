import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Db } from './repository.js';

/**
 * Production points at Neon through DATABASE_URL. Development without one falls back to PGlite on
 * disk, so the app runs with no service to sign up for and no connection string to leak.
 */
/**
 * How to hand the connection back, keyed by the Db it belongs to.
 *
 * A long-running server never closes: one connection is reused for the process's life. A CLI
 * command must, and for two different reasons. postgres-js holds an open socket, so the process
 * hangs after the work is done; PGlite holds a single-writer lock on the directory, so the next
 * command blocks forever on a lock nobody released.
 */
const closers = new WeakMap<Db, () => Promise<void>>();

/** Releases whatever `connect` opened. Safe to call on a Db that has no closer. */
export async function disconnect(db: Db): Promise<void> {
  const close = closers.get(db);
  if (close) {
    closers.delete(db);
    await close();
  }
}

export async function connect(url = process.env['DATABASE_URL']): Promise<Db> {
  if (url) {
    // Notices are Postgres talking to itself — "relation already exists, skipping" from an
    // idempotent migration is not something a treasurer needs to read.
    const client = postgres(url, { prepare: false, onnotice: () => {} });
    const db = drizzlePg(client) as unknown as Db;
    closers.set(db, () => client.end());
    return db;
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

  const client = new PGlite(directory);
  const db = drizzle(client) as unknown as Db;
  closers.set(db, () => client.close());
  return db;
}
