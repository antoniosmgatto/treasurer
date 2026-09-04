import { isValidCode } from './codes.js';
import type { Event, Member } from './types.js';

export class InvalidLedgerError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Ledger is not valid:\n- ${problems.join('\n- ')}`);
    this.name = 'InvalidLedgerError';
  }
}

export function validateMembers(members: readonly Member[]): string[] {
  const problems: string[] = [];

  const seenCodes = new Map<number, string>();
  for (const member of members) {
    if (!isValidCode(member.code)) {
      problems.push(`${member.name} has an out-of-range code: ${member.code}`);
    }
    const owner = seenCodes.get(member.code);
    if (owner) problems.push(`Code ${member.code} is shared by ${owner} and ${member.name}`);
    else seenCodes.set(member.code, member.name);
  }

  const seenIds = new Set<string>();
  for (const member of members) {
    if (seenIds.has(member.id)) problems.push(`Duplicate member id: ${member.id}`);
    seenIds.add(member.id);
  }

  return problems;
}

export function validateEvent(event: Event, members: readonly Member[]): string[] {
  const problems: string[] = [];
  const byId = new Map(members.map((member) => [member.id, member]));

  for (const expense of event.expenses) {
    if (expense.collector.kind === 'member' && !byId.get(expense.collector.memberId)) {
      problems.push(`${expense.description}: unknown payer ${expense.collector.memberId}`);
    }
    if (expense.amount <= 0) problems.push(`${expense.description}: amount must be positive`);

    const seen = new Set<string>();
    for (const participant of expense.participants) {
      const member = byId.get(participant.memberId);
      if (!member) {
        problems.push(`${expense.description}: unknown participant ${participant.memberId}`);
        continue;
      }
      if (seen.has(participant.memberId)) {
        problems.push(`${expense.description}: ${member.name} listed twice`);
      }
      seen.add(participant.memberId);
    }
  }

  return problems;
}

export function assertValid(event: Event, members: readonly Member[]): void {
  const problems = [...validateMembers(members), ...validateEvent(event, members)];
  if (problems.length > 0) throw new InvalidLedgerError(problems);
}
