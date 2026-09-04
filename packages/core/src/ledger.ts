import { cents, sum, type Cents } from './money.js';
import { splitByWeight } from './split.js';
import type { Event, Expense, MemberId } from './types.js';

/**
 * The ledger is append-only (D3). A correction is a new entry, never an edit, so the question
 * "who changed this?" cannot arise.
 */
export type EntryKind =
  | 'share' /** the member's part of an expense */
  | 'front' /** money the member put in up front */
  | 'payment' /** money received from the member */
  | 'reimbursement' /** money paid out to the member */
  | 'rounding' /** identification-code surplus, moved to the treasury */
  | 'adjustment';

export interface LedgerEntry {
  memberId: MemberId;
  kind: EntryKind;
  /** Positive: the group owes the member. Negative: the member owes the group. */
  amount: Cents;
  eventId?: string | undefined;
  expenseId?: string | undefined;
  note?: string | undefined;
}

/**
 * One expense becomes one credit to whoever fronted it and one debit per participant. The
 * flooring remainder lands on the payer, who is the only person with no grounds to complain.
 */
export function entriesForExpense(expense: Expense, eventId?: string): LedgerEntry[] {
  const { shares, remainder } = splitByWeight(expense.amount, expense.participants);
  const base = { eventId, expenseId: expense.id } as const;

  const entries: LedgerEntry[] = [
    { ...base, memberId: expense.payerId, kind: 'front', amount: expense.amount },
  ];

  for (const [memberId, share] of shares) {
    const owed = memberId === expense.payerId ? cents(share + remainder) : share;
    if (owed === 0 && memberId !== expense.payerId) {
      entries.push({ ...base, memberId, kind: 'share', amount: cents(0) });
      continue;
    }
    entries.push({ ...base, memberId, kind: 'share', amount: cents(-owed) });
  }

  const payerIsParticipant = shares.has(expense.payerId);
  if (!payerIsParticipant && remainder !== 0) {
    entries.push({ ...base, memberId: expense.payerId, kind: 'share', amount: cents(-remainder) });
  }

  return entries;
}

export function entriesForEvent(event: Event): LedgerEntry[] {
  return event.expenses.flatMap((expense) => entriesForExpense(expense, event.id));
}

/** Folds entries into a balance per member. Positive means the group owes them. */
export function balances(entries: Iterable<LedgerEntry>): Map<MemberId, Cents> {
  const totals = new Map<MemberId, Cents>();
  for (const entry of entries) {
    const current = totals.get(entry.memberId) ?? 0;
    totals.set(entry.memberId, cents(current + entry.amount));
  }
  return totals;
}

export function balanceOf(entries: Iterable<LedgerEntry>, memberId: MemberId): Cents {
  return sum([...entries].filter((e) => e.memberId === memberId).map((e) => e.amount));
}
