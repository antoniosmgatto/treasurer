import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Db } from './repository.js';

/**
 * Built from dirname rather than `new URL('../migrations', import.meta.url)`: bundlers treat that
 * literal form as a static asset reference and try to resolve it at build time.
 */
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Drizzle's execute returns rows directly on postgres-js and wrapped in `.rows` on PGlite. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

async function tableExists(db: Db, name: string): Promise<boolean> {
  const result = await db.execute(
    sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${name} limit 1`,
  );
  return rowsOf(result).length > 0;
}

/**
 * Applies each migration once and records it, so running this twice is a no-op.
 *
 * The first version simply replayed every file, on the assumption that the database was always
 * fresh. That held until the day this deployed: the second `treasurer migrate` against a live
 * database died on `type "entry_kind" already exists`, and so did seeding a second club.
 */
export async function applyMigrations(db: Db): Promise<void> {
  await db.execute(
    sql`create table if not exists "_migration" ("name" text primary key, "applied_at" timestamptz not null default now())`,
  );

  const applied = new Set(
    rowsOf(await db.execute(sql`select "name" from "_migration"`)).map((row) =>
      String(row['name']),
    ),
  );

  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  /**
   * A database migrated before this table existed already carries the initial schema. Adopt it by
   * recording the baseline instead of trying to create everything a second time. Only the initial
   * migration ever shipped untracked, so it is the only one this may assume.
   */
  const baseline = files[0];
  if (baseline && applied.size === 0 && (await tableExists(db, 'member'))) {
    await db.execute(sql`insert into "_migration" ("name") values (${baseline})`);
    applied.add(baseline);
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const contents = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const statement of contents.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await db.execute(trimmed);
    }
    await db.execute(sql`insert into "_migration" ("name") values (${file})`);
  }
}
