#!/usr/bin/env node
import {
  allGroups,
  applyMigrations,
  connect,
  createGroup,
  disconnect,
  linksFor,
  rotateWriteToken,
} from '@treasurer/db';
import { readFileSync } from 'node:fs';
import {
  chatSummary,
  formatBRL,
  formatCode,
  InvalidLedgerError,
  memberSummary,
  parseEventFile,
  ParseError,
  settle,
} from '@treasurer/core';

const USAGE = `treasurer — settle an event, or bootstrap a club

  treasurer <file.json>              per-member table and chat summary
  treasurer <file.json> --member ID  one member's own breakdown
  treasurer seed <club.json>         create the club and print everyone's links
  treasurer links [--rotate]         reprint the links; --rotate reissues the write link
  treasurer migrate                  apply migrations to DATABASE_URL

Settling is a test harness (D5); seeding is how a club first exists (D18).
The file shapes are in examples/.`;

/**
 * A missing or malformed file is a typo, not a crash. Both paths into the CLI read JSON the user
 * wrote by hand, so both get told what is wrong instead of a stack trace.
 */
function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ParseError(`Arquivo não encontrado: ${path}`);
    }
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ParseError(`${path} não é um JSON válido`);
  }
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/**
 * D18: the admin page cannot create the first club, because reaching it needs a token that this
 * command issues. Members are read from the same JSON the settler already understands.
 */
async function seed(path: string): Promise<number> {
  // Seeding the wrong database looks exactly like seeding the right one: a club is created and
  // links are printed. Say which one before doing it, so a missing DATABASE_URL is visible.
  console.log(
    process.env['DATABASE_URL']
      ? 'Criando o clube no banco remoto (DATABASE_URL)…\n'
      : 'Criando o clube no banco LOCAL (.data) — DATABASE_URL não está definida.\n',
  );

  const file = readJson(path) as {
    name?: string;
    members?: { name: string; code?: number; isTreasury?: boolean }[];
  };
  if (!Array.isArray(file.members)) {
    console.error('Expected { "name": "...", "members": [...] }');
    return 1;
  }

  const db = await connect();
  try {
    await applyMigrations(db);

    const created = await createGroup(db, {
      name: file.name ?? 'Clube',
      members: file.members.map((member, index) => ({
        name: member.name,
        code: member.code ?? index,
        isTreasury: member.isTreasury === true,
      })),
    });

    console.log(`Clube criado.\n`);
    console.log(`Link do tesoureiro (guarde, dá acesso de escrita):`);
    console.log(`  /acesso/${created.writeToken}\n`);
    console.log(`Links dos membros:`);
    for (const link of created.links) {
      console.log(`  ${formatCode(link.code)}  ${link.name.padEnd(20)}  ${link.url}`);
    }
    return 0;
  } finally {
    // Otherwise postgres-js keeps its socket open and the command never exits, and PGlite keeps
    // the directory lock that makes the next command hang.
    await disconnect(db);
  }
}

/**
 * Reprints what `seed` printed once, and can reissue the write link.
 *
 * A write token is a password that happens to be a URL. Losing it locks the treasurer out of
 * their own club; pasting it somewhere public should cost a new link rather than a new club.
 */
async function links(rotate: boolean): Promise<number> {
  const db = await connect();
  try {
    const groups = await allGroups(db);
    if (groups.length === 0) {
      console.error('Nenhum clube neste banco. Rode `treasurer seed` primeiro.');
      return 1;
    }
    if (groups.length > 1) {
      console.error('Mais de um clube neste banco; este comando ainda não sabe escolher:');
      for (const group of groups) console.error(`  ${group.id}  ${group.name}`);
      return 1;
    }

    const only = groups[0]!;
    if (rotate) {
      const replaced = await rotateWriteToken(db, only.id);
      if (replaced) console.log('Link do tesoureiro reemitido — o anterior parou de funcionar.\n');
    }

    const found = await linksFor(db, only.id);
    if (!found) {
      console.error('Clube não encontrado.');
      return 1;
    }

    console.log(`${only.name}\n`);
    console.log('Link do tesoureiro (guarde, dá acesso de escrita):');
    console.log(`  /acesso/${found.writeToken}\n`);
    console.log('Links dos membros:');
    for (const link of found.links) {
      console.log(`  ${formatCode(link.code)}  ${link.name.padEnd(20)}  ${link.url}`);
    }
    return 0;
  } finally {
    await disconnect(db);
  }
}

/** Applies the schema to whatever DATABASE_URL points at — the deploy step. */
async function migrate(): Promise<number> {
  const target = process.env['DATABASE_URL'];
  console.log(target ? 'Migrando o banco remoto…' : 'Migrando o banco local (.data)…');

  const db = await connect();
  try {
    await applyMigrations(db);
    console.log('Pronto.');
    return 0;
  } finally {
    await disconnect(db);
  }
}

function main(argv: string[]): number {
  const [path] = argv;
  if (!path || path === '--help' || path === '-h') {
    console.log(USAGE);
    return path ? 0 : 1;
  }

  const memberFlag = argv.indexOf('--member');
  const memberId = memberFlag === -1 ? undefined : argv[memberFlag + 1];

  const { members, event } = parseEventFile(readJson(path));
  const settlement = settle(event, members);

  if (memberId) {
    const member = settlement.members.find((candidate) => candidate.memberId === memberId);
    if (!member) {
      console.error(`No member "${memberId}" took part in this event`);
      return 1;
    }
    console.log(memberSummary(member));
    return 0;
  }

  const width = Math.max(...settlement.members.map((member) => member.name.length), 6);
  console.log(`${event.name} — ${event.date} — total ${formatBRL(settlement.total)}\n`);
  console.log(
    `${pad('Membro', width)}  ${padStart('cód', 4)}  ${padStart('parte', 12)}  ${padStart('a pagar', 12)}  ${padStart('recebe', 12)}`,
  );
  for (const member of settlement.members) {
    console.log(
      [
        pad(member.name, width),
        padStart(formatCode(member.code), 4),
        padStart(member.owed > 0 ? formatBRL(member.owed) : '—', 12),
        padStart(member.charged === null ? '—' : formatBRL(member.charged), 12),
        padStart(member.net > 0 ? formatBRL(member.net) : '—', 12),
      ].join('  '),
    );
  }

  console.log(`\nArredondamento pro caixa: ${formatBRL(settlement.treasurySurplus)}`);
  console.log(`\n${'-'.repeat(40)}\n`);
  console.log(chatSummary(event, settlement));
  return 0;
}

try {
  const argv = process.argv.slice(2);
  process.exitCode =
    argv[0] === 'migrate'
      ? await migrate()
      : argv[0] === 'links'
        ? await links(argv.includes('--rotate'))
        : argv[0] === 'seed'
          ? await seed(
              argv[1] ??
                (() => {
                  throw new ParseError('seed needs a file: treasurer seed club.json');
                })(),
            )
          : main(argv);
} catch (error) {
  if (error instanceof InvalidLedgerError || error instanceof ParseError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
