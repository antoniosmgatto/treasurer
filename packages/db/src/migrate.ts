import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './repository.js';

/**
 * Built from dirname rather than `new URL('../migrations', import.meta.url)`: bundlers treat that
 * literal form as a static asset reference and try to resolve it at build time.
 */
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Applies every migration in order. Deliberately simple: the statements are idempotent enough for
 * a fresh database, which is the only case this project has until it deploys.
 */
export async function applyMigrations(db: Db): Promise<void> {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS}/${file}`, 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await db.execute(trimmed);
    }
  }
}
