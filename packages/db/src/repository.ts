import {
  cents,
  type Cents,
  type Event,
  type Expense,
  type LedgerEntry,
  type Member,
} from '@treasurer/core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { newId } from './ids.js';
import {
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

/**
 * Loads everything the engine needs to settle one event, as the same plain objects it takes from
 * a JSON file. The engine never learns that a database exists.
 */
export async function loadEvent(
  db: Db,
  eventId: string,
): Promise<{ members: Member[]; event: Event } | null> {
  const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!eventRow) return null;

  const memberRows = await db
    .select()
    .from(members)
    .where(eq(members.groupId, eventRow.groupId))
    .orderBy(asc(members.code));

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.eventId, eventId))
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

  return {
    members: memberRows.map(toMember),
    event: toEvent(eventRow, expenseRows, sharesByExpense),
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
        participants: sharesByExpense.get(expenseRow.id) ?? [],
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
      retiredAt: member.retiredAt ? new Date(member.retiredAt) : null,
    })),
  );
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
