#!/usr/bin/env node
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

const USAGE = `treasurer — settle an event from a JSON file

  treasurer <file.json>              per-member table and chat summary
  treasurer <file.json> --member ID  one member's own breakdown

A test harness, not the product (D5). The file shape is in examples/.`;

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

function main(argv: string[]): number {
  const [path] = argv;
  if (!path || path === '--help' || path === '-h') {
    console.log(USAGE);
    return path ? 0 : 1;
  }

  const memberFlag = argv.indexOf('--member');
  const memberId = memberFlag === -1 ? undefined : argv[memberFlag + 1];

  const { members, event } = parseEventFile(JSON.parse(readFileSync(path, 'utf8')));
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
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof InvalidLedgerError || error instanceof ParseError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
