import {
  CLUB,
  cents,
  type Cents,
  type Event,
  type Expense,
  type LedgerEntry,
  type Member,
  type Participant,
  ZERO,
} from '@treasurer/core';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
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
  };
  if (row.code !== null) member.code = row.code;
  if (row.guestOfEventId !== null) member.guestOf = row.guestOfEventId;
  if (row.retiredAt) member.retiredAt = row.retiredAt.toISOString();
  return member;
}

/** Members still on the roster: not deleted (D19). Retired members stay, for past events. */
function liveMembers(groupId: string) {
  return and(eq(members.groupId, groupId), isNull(members.deletedAt));
}

/** The club itself: guests belong to one event and never appear on the roster (D29). */
function clubMembers(groupId: string) {
  return and(liveMembers(groupId), isNull(members.guestOfEventId));
}

/**
 * Loads everything the engine needs to settle one event, as the same plain objects it takes from
 * a JSON file. The engine never learns that a database exists.
 */
export async function loadEvent(
  db: Db,
  eventId: string,
): Promise<{ members: Member[]; event: Event; roster: Participant[] } | null> {
  const [eventRow] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1);
  if (!eventRow) return null;

  const memberRows = await db
    .select()
    .from(members)
    // The club, plus the guests who came to this event and nobody else's (D29).
    .where(
      and(
        liveMembers(eventRow.groupId),
        or(isNull(members.guestOfEventId), eq(members.guestOfEventId, eventId)),
      ),
    )
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
    // Returned in its own right: a bill with an exclusion no longer stands in for the roster.
    roster,
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
    receiptTotalCents: number | null;
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
      if (expenseRow.receiptTotalCents !== null) {
        expense.receiptTotal = cents(expenseRow.receiptTotalCents);
      }
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
      code: member.code ?? null,
      guestOfEventId: member.guestOf ?? null,
      retiredAt: member.retiredAt ? new Date(member.retiredAt) : null,
    })),
  );
}

/**
 * One event, always named and always scoped to the group holding it: an event id is not a
 * credential (D9), and since D33 there is no such thing as "the open one" to ask for instead.
 */
export async function eventIn(db: Db, groupId: string, eventId: string): Promise<EventRow | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.groupId, groupId), isNull(events.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Every event a group has had, newest first. Closing one used to make it invisible: the panel and
 * the member view both asked only for the open event, so a settled trip stopped existing for
 * everybody who took part in it.
 */
export async function eventsOf(db: Db, groupId: string): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.groupId, groupId), isNull(events.deletedAt)))
    .orderBy(desc(events.date), desc(events.createdAt));
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
  /** The roster the CLI prints back. No link per person any more — D11 is superseded by D32. */
  members: { name: string; code: number }[];
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
    members: created
      .filter((row) => row.code !== null)
      .map((row) => ({ name: row.name, code: row.code as number })),
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
 * Reissues the write link `seed` printed once. Without this the only copy of a treasurer's write
 * token is their terminal scrollback, and a lost one locks the club out of its own panel.
 */
export async function linksFor(db: Db, groupId: string): Promise<CreatedGroup | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return null;

  const rows = await db
    .select()
    .from(members)
    .where(clubMembers(groupId))
    .orderBy(asc(members.code));
  return {
    groupId,
    writeToken: group.writeToken,
    members: rows
      .filter((row) => row.code !== null)
      .map((row) => ({ name: row.name, code: row.code as number })),
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
    .where(clubMembers(groupId))
    .orderBy(asc(members.code));
  return rows.map(toMember);
}

/**
 * A guest: a name on one event, chargeable there, with no code, no link and no place in the club
 * (D29). Nobody is liable for them — the event link is shared with them, or somebody uploads
 * their receipt for them.
 */
export async function addGuest(
  db: Db,
  input: { groupId: string; eventId: string; name: string },
): Promise<string> {
  const id = newId();
  await db.insert(members).values({
    id,
    groupId: input.groupId,
    name: input.name,
    code: null,
    guestOfEventId: input.eventId,
  });
  return id;
}

/**
 * D31: what an event is called, when it happened and what it says about itself are all correctable
 * while it is open. A typo in the name is the same kind of mistake as a typo in an amount.
 */
export async function describeEvent(
  db: Db,
  eventId: string,
  input: { name: string; date: string; description: string | null },
): Promise<void> {
  await db
    .update(events)
    .set({ name: input.name, date: input.date, description: input.description })
    .where(and(eq(events.id, eventId), eq(events.status, 'open')));
}

export async function openEvent(
  db: Db,
  input: { groupId: string; name: string; date: string },
): Promise<string> {
  const id = newId();
  await db.insert(events).values({
    id,
    groupId: input.groupId,
    name: input.name,
    date: input.date,
    shareToken: newToken(),
  });
  return id;
}

/** The one link for a rolê: whoever holds it sees the whole table (Q34). */
export async function eventByShareToken(
  db: Db,
  token: string,
): Promise<{ event: EventRow; groupId: string } | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.shareToken, token), isNull(events.deletedAt)))
    .limit(1);
  return row ? { event: row, groupId: row.groupId } : null;
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
  // Guests hold no code, so they never consume one (D29).
  const used = new Set(rows.map((row) => row.code).filter((code) => code !== null));
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
    receiptTotalCents: expense.receiptTotal ?? null,
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

/**
 * D31: a bill is correctable while the event is open — the amount, who collects it, who was in on
 * it, all of it. Receipts get read wrong and buyers remember a number late, and an app that makes
 * that unfixable is worse than the group chat it replaces.
 *
 * The shares are rewritten wholesale rather than merged: an edit that unticks somebody has to be
 * able to remove their row, not only change its weight. Returns false when the event is closed,
 * which is the one point corrections stop.
 */
export async function updateExpense(db: Db, eventId: string, expense: Expense): Promise<boolean> {
  const [event] = await db
    .select({ status: events.status })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1);
  if (!event || event.status !== 'open') return false;

  const updated = await db
    .update(expenses)
    .set({
      description: expense.description,
      payerId: expense.collector.kind === 'member' ? expense.collector.memberId : null,
      collectionKey: expense.collectionKey ?? null,
      amount: expense.amount,
      receiptTotalCents: expense.receiptTotal ?? null,
    })
    .where(and(eq(expenses.id, expense.id), eq(expenses.eventId, eventId)))
    .returning({ id: expenses.id });
  if (updated.length === 0) return false;

  await db.delete(shares).where(eq(shares.expenseId, expense.id));
  if (expense.participants.length > 0) {
    await db.insert(shares).values(
      expense.participants.map((participant) => ({
        expenseId: expense.id,
        memberId: participant.memberId,
        weight: participant.weight,
      })),
    );
  }
  return true;
}

/**
 * What the bills say about a member, kept apart from what has actually moved. The distinction is
 * the whole of D31: a payment that once squared a charge is not wrong because the charge moved
 * under it — it is a payment that now needs somebody to look at it.
 */
export interface Position {
  /** The recorded charges. Negative when the member owes, positive when they are owed. */
  charged: Cents;
  /** Money that changed hands, in either direction. Zero means nobody has paid anybody. */
  moved: Cents;
}

/** Kinds that record a charge rather than a transfer. Adjustments correct charges (D3, D31). */
const CHARGE_KINDS = new Set(['share', 'front', 'rounding', 'adjustment']);

/**
 * Per member, for one event. Group-wide balances answered this until a club could have more than
 * one event; folding two trips into one number makes the second one unreadable.
 */
export async function positionsIn(db: Db, eventId: string): Promise<Map<string, Position>> {
  const rows = await db
    .select({
      memberId: ledgerEntries.memberId,
      kind: ledgerEntries.kind,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.eventId, eventId));

  const positions = new Map<string, Position>();
  for (const row of rows) {
    const current = positions.get(row.memberId) ?? { charged: ZERO, moved: ZERO };
    if (CHARGE_KINDS.has(row.kind)) current.charged = cents(current.charged + row.amount);
    else current.moved = cents(current.moved + row.amount);
    positions.set(row.memberId, current);
  }
  return positions;
}

/**
 * Brings the recorded charges back in line with the bills after a correction, without editing a
 * thing: it appends one adjustment per member for the difference between what the ledger says and
 * what the event now costs them (D3).
 *
 * Only for a published event — before that no charge has been recorded, and appending here would
 * mean publishing the same numbers twice. Doing nothing when the difference is zero is what makes
 * it safe to call after every correction, including the ones that change nobody's share.
 */
export async function recomputeCharges(
  db: Db,
  groupId: string,
  eventId: string,
  entries: readonly LedgerEntry[],
): Promise<void> {
  const recorded = await positionsIn(db, eventId);

  const wanted = new Map<string, Cents>();
  for (const entry of entries) {
    wanted.set(entry.memberId, cents((wanted.get(entry.memberId) ?? 0) + entry.amount));
  }

  const corrections: LedgerEntry[] = [];
  for (const memberId of new Set([...recorded.keys(), ...wanted.keys()])) {
    const delta = cents((wanted.get(memberId) ?? 0) - (recorded.get(memberId)?.charged ?? 0));
    if (delta === 0) continue;
    corrections.push({
      memberId,
      kind: 'adjustment',
      amount: delta,
      eventId,
      note: 'correção depois do rateio fechado',
    });
  }

  await appendEntries(db, groupId, corrections);
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

/**
 * Every ledger entry a member has in a group, folded into one number.
 *
 * Nothing in the app reads this, and since D33 it is worth saying why before anything does: it is
 * group-scoped, so with several rolês open it adds two trips into a balance that names neither.
 * The panel wants `positionsIn`, which answers per event (D31).
 */
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
