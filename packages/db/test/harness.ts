import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from '../src/repository.js';

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Real Postgres, in-process. No container, no connection string, no shared state between tests —
 * and the same indexes and constraints production enforces.
 */
export async function freshDatabase(): Promise<Db> {
  const client = new PGlite();
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS}/${file}`, 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }
  return drizzle(client) as unknown as Db;
}
