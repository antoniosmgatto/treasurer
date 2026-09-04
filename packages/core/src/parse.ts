import { cents, parseBRL, type Cents } from './money.js';
import type { Event, Expense, Member, Participant } from './types.js';

/**
 * Reads the plain-JSON shape the CLI accepts. Hand-written rather than schema-driven so the
 * package stays dependency-free, and so the errors name the thing a person got wrong.
 */
export interface EventFile {
  members: Member[];
  event: Event;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Amounts may be written "155,00", "R$ 155,00", or as an integer number of cents. */
function readAmount(value: unknown, where: string): Cents {
  if (typeof value === 'number') return cents(value);
  if (typeof value === 'string') {
    try {
      return parseBRL(value);
    } catch {
      throw new ParseError(`${where}: "${value}" is not an amount`);
    }
  }
  throw new ParseError(`${where}: missing amount`);
}

function readString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ParseError(`${where}: required`);
  return value;
}

function readMember(raw: unknown, index: number): Member {
  if (typeof raw !== 'object' || raw === null)
    throw new ParseError(`members[${index}]: not an object`);
  const record = raw as Record<string, unknown>;
  const where = `members[${index}]`;
  const code = record['code'];
  if (typeof code !== 'number') throw new ParseError(`${where}: code must be a number`);

  const member: Member = {
    id: readString(record['id'], `${where}.id`),
    name: readString(record['name'], `${where}.name`),
    code,
    isTreasury: record['isTreasury'] === true,
  };
  if (typeof record['retiredAt'] === 'string') member.retiredAt = record['retiredAt'];
  return member;
}

function readParticipant(raw: unknown, where: string): Participant {
  if (typeof raw === 'string') return { memberId: raw, weight: 1 };
  if (typeof raw !== 'object' || raw === null) throw new ParseError(`${where}: not a participant`);
  const record = raw as Record<string, unknown>;
  const weight = record['weight'];
  return {
    memberId: readString(record['memberId'], `${where}.memberId`),
    weight: typeof weight === 'number' ? weight : 1,
  };
}

function readExpense(raw: unknown, index: number): Expense {
  if (typeof raw !== 'object' || raw === null) {
    throw new ParseError(`expenses[${index}]: not an object`);
  }
  const record = raw as Record<string, unknown>;
  const where = `expenses[${index}]`;
  const participants = record['participants'];
  if (!Array.isArray(participants)) throw new ParseError(`${where}.participants: required`);

  const expense: Expense = {
    id: readString(record['id'], `${where}.id`),
    description: readString(record['description'], `${where}.description`),
    payerId: readString(record['payerId'], `${where}.payerId`),
    amount: readAmount(record['amount'], `${where}.amount`),
    participants: participants.map((participant, at) =>
      readParticipant(participant, `${where}.participants[${at}]`),
    ),
  };
  if (typeof record['receiptUrl'] === 'string') expense.receiptUrl = record['receiptUrl'];
  return expense;
}

export function parseEventFile(input: unknown): EventFile {
  if (typeof input !== 'object' || input === null) throw new ParseError('Expected a JSON object');
  const record = input as Record<string, unknown>;

  const members = record['members'];
  if (!Array.isArray(members)) throw new ParseError('members: expected an array');

  const rawEvent = record['event'];
  if (typeof rawEvent !== 'object' || rawEvent === null) {
    throw new ParseError('event: expected an object');
  }
  const eventRecord = rawEvent as Record<string, unknown>;
  const expenses = eventRecord['expenses'];
  if (!Array.isArray(expenses)) throw new ParseError('event.expenses: expected an array');

  return {
    members: members.map(readMember),
    event: {
      id: readString(eventRecord['id'], 'event.id'),
      name: readString(eventRecord['name'], 'event.name'),
      date: readString(eventRecord['date'], 'event.date'),
      status: eventRecord['status'] === 'settled' ? 'settled' : 'open',
      expenses: expenses.map(readExpense),
    },
  };
}
