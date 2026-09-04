import {
  cents,
  type Cents,
  type Event,
  type Expense,
  type LedgerEntry,
  type Member,
} from '@treasurer/core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { newId, newToken } from './ids.js';
import {
  eventParticipants,
  events,
  expenses,
  ledgerEntries,
  members,
  shares,
  type EventRow,
  type MemberRow,
} from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, Record<string, never>, Record<string, never>>;

function toMember(row: MemberRow): Member {
  const member: Member = {
    id: row.id,
    name: row.name,
    code: row.code,
    isTreasury: row.isTreasury,
  };
  if (row.retiredAt) member.retiredAt = row.retiredAt.toISOString();
  return member;
}

/** Members still on the roster: not deleted (D19). Retired members stay, for past events. */
function liveMembers(groupId: string) {
  return and(eq(members.groupId, groupId), isNull(members.deletedAt));
}

/**
 * Loads everything the engine needs to settle one event, as the same plain objects it takes from
 * a JSON file. The engine never learns that a database exists.
 */
export async function loadEvent(
  db: Db,
  eventId: string,
): Promise<{ members: Member[]; event: Event } | null> {
  const [eventRow] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1);
  if (!eventRow) return null;

  const memberRows = await db
    .select()
    .from(members)
    .where(liveMembers(eventRow.groupId))
    .orderBy(asc(members.code));

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.eventId, eventId), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.createdAt), asc(expenses.id));

  const expenseIds = expenseRows.map((row) => row.id);
  const shareRows =
    expenseIds.length === 0
      ? []
      : await db.select().from(shares).where(inArray(shares.expenseId, expenseIds));

  const sharesByExpense = new Map<string, { memberId: string; weight: number }[]>();
  for (const row of shareRows) {
    const existing = sharesByExpense.get(row.expenseId);
    const participant = { memberId: row.memberId, weight: row.weight };
    if (existing) existing.push(participant);
    else sharesByExpense.set(row.expenseId, [participant]);
  }

  // D12: the roster is the default. An expense with its own shares overrides it entirely.
  const rosterRows = await db
    .select()
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId));
  const roster = rosterRows.map((row) => ({ memberId: row.memberId, weight: row.weight }));

  return {
    members: memberRows.map(toMember),
    event: toEvent(eventRow, expenseRows, sharesByExpense, roster),
  };
}

function toEvent(
  row: EventRow,
  expenseRows: readonly {
    id: string;
    description: string;
    payerId: string;
    amount: number;
    receiptUrl: string | null;
  }[],
  sharesByExpense: ReadonlyMap<string, { memberId: string; weight: number }[]>,
  roster: readonly { memberId: string; weight: number }[],
): Event {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status: row.status,
    expenses: expenseRows.map((expenseRow) => {
      const expense: Expense = {
        id: expenseRow.id,
        description: expenseRow.description,
        payerId: expenseRow.payerId,
        amount: cents(expenseRow.amount),
        participants: sharesByExpense.get(expenseRow.id) ?? roster,
      };
      if (expenseRow.receiptUrl) expense.receiptUrl = expenseRow.receiptUrl;
      return expense;
    }),
  };
}

export async function insertMembers(
  db: Db,
  groupId: string,
  rows: readonly Member[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(members).values(
    rows.map((member) => ({
      id: member.id,
      groupId,
      name: member.name,
      code: member.code,
      isTreasury: member.isTreasury,
      readToken: newToken(),
      retiredAt: member.retiredAt ? new Date(member.retiredAt) : null,
    })),
  );
}

/** Resolves a member's own read link (D11) to the member and the group's open event. */
export async function memberByReadToken(
  db: Db,
  token: string,
): Promise<{ member: Member; groupId: string } | null> {
  const [row] = await db
    .select()
    .from(members)
    .where(and(eq(members.readToken, token), isNull(members.deletedAt)))
    .limit(1);
  return row ? { member: toMember(row), groupId: row.groupId } : null;
}

export async function openEventFor(db: Db, groupId: string): Promise<EventRow | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.groupId, groupId), eq(events.status, 'open'), isNull(events.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** D15: until this is set, members are shown no amount at all. */
export async function publishCharges(db: Db, eventId: string): Promise<void> {
  await db.update(events).set({ chargesPublishedAt: new Date() }).where(eq(events.id, eventId));
}

export async function setRoster(
  db: Db,
  eventId: string,
  roster: readonly { memberId: string; weight: number }[],
): Promise<void> {
  await db.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId));
  if (roster.length === 0) return;
  await db
    .insert(eventParticipants)
    .values(roster.map((entry) => ({ eventId, memberId: entry.memberId, weight: entry.weight })));
}

/**
 * D19: nothing is destroyed. An expense that already produced ledger entries keeps them and gains
 * reversing ones, because the ledger only ever grows (D3).
 */
export async function softDeleteExpense(db: Db, groupId: string, expenseId: string): Promise<void> {
  const existing = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.expenseId, expenseId));

  await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, expenseId));

  if (existing.length > 0) {
    await appendEntries(
      db,
      groupId,
      existing.map((entry) => ({
        memberId: entry.memberId,
        kind: 'adjustment' as const,
        amount: cents(-entry.amount),
        eventId: entry.eventId ?? undefined,
        expenseId: entry.expenseId ?? undefined,
        note: 'estorno de despesa removida',
      })),
    );
  }
}

export async function retireMember(db: Db, memberId: string): Promise<void> {
  await db.update(members).set({ retiredAt: new Date() }).where(eq(members.id, memberId));
}

/** Records money arriving from a member (D13). */
export async function recordPayment(
  db: Db,
  groupId: string,
  input: { memberId: string; eventId: string; amount: Cents },
): Promise<void> {
  await appendEntries(db, groupId, [
    {
      memberId: input.memberId,
      kind: 'payment',
      amount: input.amount,
      eventId: input.eventId,
    },
  ]);
}

/**
 * The lowest code not yet used by this group, retired members included — reissuing a code would
 * misattribute a late payment (D7).
 */
export async function nextCode(db: Db, groupId: string): Promise<number> {
  const rows = await db
    .select({ code: members.code })
    .from(members)
    .where(eq(members.groupId, groupId));
  const used = new Set(rows.map((row) => row.code));
  for (let code = 1; code <= 99; code++) {
    if (!used.has(code)) return code;
  }
  throw new RangeError('All identification codes 01–99 are spent for this group');
}

export async function recordExpense(db: Db, eventId: string, expense: Expense): Promise<void> {
  await db.insert(expenses).values({
    id: expense.id,
    eventId,
    description: expense.description,
    payerId: expense.payerId,
    amount: expense.amount,
    receiptUrl: expense.receiptUrl ?? null,
  });

  if (expense.participants.length > 0) {
    await db.insert(shares).values(
      expense.participants.map((participant) => ({
        expenseId: expense.id,
        memberId: participant.memberId,
        weight: participant.weight,
      })),
    );
  }
}

/** Entries are only ever appended (D3). There is deliberately no update and no delete. */
export async function appendEntries(
  db: Db,
  groupId: string,
  entries: readonly LedgerEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(ledgerEntries).values(
    entries.map((entry) => ({
      id: newId(),
      groupId,
      memberId: entry.memberId,
      eventId: entry.eventId ?? null,
      expenseId: entry.expenseId ?? null,
      kind: entry.kind,
      amount: entry.amount,
      note: entry.note ?? null,
    })),
  );
}

export async function balancesFor(db: Db, groupId: string): Promise<Map<string, Cents>> {
  const rows = await db
    .select({ memberId: ledgerEntries.memberId, amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.groupId, groupId));

  const totals = new Map<string, Cents>();
  for (const row of rows) {
    totals.set(row.memberId, cents((totals.get(row.memberId) ?? 0) + row.amount));
  }
  return totals;
}

export async function closeEvent(db: Db, eventId: string): Promise<void> {
  await db
    .update(events)
    .set({ status: 'settled', settledAt: new Date() })
    .where(and(eq(events.id, eventId), eq(events.status, 'open')));
}
