import {
  CLUB,
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
  groups,
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

  /**
   * An event nobody has been added to means everybody, not nobody. The panel already renders it
   * that way — with no roster stored, every checkbox appears ticked — and a treasurer who agrees
   * with what they see has no reason to press save. Reading it back as an empty roster made the
   * split silently collapse: with no participants, each expense lands straight back on whoever
   * paid it and the whole event settles to zero.
   *
   * A retired member is not on a current event (D7).
   */
  const roster =
    rosterRows.length > 0
      ? rosterRows.map((row) => ({ memberId: row.memberId, weight: row.weight }))
      : memberRows.filter((row) => !row.retiredAt).map((row) => ({ memberId: row.id, weight: 1 }));

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
    payerId: string | null;
    collectionKey: string | null;
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
        // A null payer is the club: it fronted the bill and collects it (D25).
        collector: expenseRow.payerId ? { kind: 'member', memberId: expenseRow.payerId } : CLUB,
        amount: cents(expenseRow.amount),
        participants: sharesByExpense.get(expenseRow.id) ?? roster,
      };
      if (expenseRow.collectionKey) expense.collectionKey = expenseRow.collectionKey;
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

export interface CreatedGroup {
  groupId: string;
  writeToken: string;
  links: { name: string; code: number; url: string }[];
}

/** D18: the CLI bootstraps a club, because the admin page needs a token this call issues. */
export async function createGroup(
  db: Db,
  input: { name: string; members: readonly Omit<Member, 'id'>[] },
): Promise<CreatedGroup> {
  const groupId = newId();
  const writeToken = newToken();

  await db.insert(groups).values({
    id: groupId,
    name: input.name,
    writeToken,
    readToken: newToken(),
  });

  const rows = input.members.map((member) => ({ ...member, id: newId() }));
  await insertMembers(db, groupId, rows);

  const created = await db.select().from(members).where(eq(members.groupId, groupId));
  return {
    groupId,
    writeToken,
    links: created.map((row) => ({
      name: row.name,
      code: row.code,
      url: `/e/${row.readToken}`,
    })),
  };
}

/** Every club in the database, for a CLI that has to name one before it can act on it. */
export async function allGroups(db: Db): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .orderBy(asc(groups.createdAt));
}

/**
 * Reissues the links `seed` printed once. Without this the only copy of a treasurer's write token
 * is their terminal scrollback, and a lost one locks the club out of its own panel.
 */
export async function linksFor(db: Db, groupId: string): Promise<CreatedGroup | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return null;

  const rows = await db
    .select()
    .from(members)
    .where(liveMembers(groupId))
    .orderBy(asc(members.code));
  return {
    groupId,
    writeToken: group.writeToken,
    links: rows.map((row) => ({ name: row.name, code: row.code, url: `/e/${row.readToken}` })),
  };
}

/**
 * A write token is a password that happens to live in a URL, so it has to be replaceable. Pasting
 * one into a chat, a screenshot or a support thread should cost a new link, not a new club.
 */
export async function rotateWriteToken(db: Db, groupId: string): Promise<string | null> {
  const token = newToken();
  const updated = await db
    .update(groups)
    .set({ writeToken: token })
    .where(eq(groups.id, groupId))
    .returning({ id: groups.id });
  return updated.length > 0 ? token : null;
}

export async function groupByWriteToken(db: Db, token: string): Promise<string | null> {
  const [row] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.writeToken, token))
    .limit(1);
  return row?.id ?? null;
}

export async function membersOf(db: Db, groupId: string): Promise<Member[]> {
  const rows = await db
    .select()
    .from(members)
    .where(liveMembers(groupId))
    .orderBy(asc(members.code));
  return rows.map(toMember);
}

export async function openEvent(
  db: Db,
  input: { groupId: string; name: string; date: string },
): Promise<string> {
  const id = newId();
  await db
    .insert(events)
    .values({ id, groupId: input.groupId, name: input.name, date: input.date });
  return id;
}

export async function addMember(
  db: Db,
  groupId: string,
  name: string,
): Promise<{ id: string; code: number }> {
  const code = await nextCode(db, groupId);
  const id = newId();
  await insertMembers(db, groupId, [{ id, name, code }]);
  return { id, code };
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
 * The other direction: the caixa paying back whoever fronted money. Takes the amount handed over,
 * and stores it negated, because a positive entry means the group owes the member and reimbursing
 * them is what discharges that. Without this an event can never reach zero — the members settle up
 * and the fronters stay creditors forever.
 */
export async function recordReimbursement(
  db: Db,
  groupId: string,
  input: { memberId: string; eventId: string; amount: Cents },
): Promise<void> {
  await appendEntries(db, groupId, [
    {
      memberId: input.memberId,
      kind: 'reimbursement',
      amount: cents(-input.amount),
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
    payerId: expense.collector.kind === 'member' ? expense.collector.memberId : null,
    collectionKey: expense.collectionKey ?? null,
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
