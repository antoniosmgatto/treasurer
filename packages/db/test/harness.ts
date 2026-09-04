import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from '../src/repository.js';

const MIGRATION = fileURLToPath(new URL('../migrations/0000_init.sql', import.meta.url));

/**
 * Real Postgres, in-process. No container, no connection string, no shared state between tests —
 * and the same partial unique indexes that production will enforce.
 */
export async function freshDatabase(): Promise<Db> {
  const client = new PGlite();
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) await client.exec(trimmed);
  }
  return drizzle(client) as unknown as Db;
}
