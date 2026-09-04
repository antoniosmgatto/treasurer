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
  | 'rounding' /** what rounding the shares up left over, credited to whoever collects */
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
 * One expense becomes one debit per participant, and — when a member collects it — one credit to
 * them for what they fronted. Shares are rounded up, so they add up to a little more than the
 * bill; that difference is credited to the collector as its own entry rather than folded into a
 * share, which keeps the expense balanced and the rounding visible (D1, D24).
 *
 * A bill the club collects produces debits only. The club is not a member row and holds no
 * balance (D25), so there is nothing to credit: the money simply leaves the members and reaches
 * the club's key.
 */
export function entriesForExpense(expense: Expense, eventId?: string): LedgerEntry[] {
  const { shares, rounding } = splitByWeight(expense.amount, expense.participants);
  const base = { eventId, expenseId: expense.id } as const;
  const collector = expense.collector;

  const entries: LedgerEntry[] = [];

  if (collector.kind === 'member') {
    entries.push({ ...base, memberId: collector.memberId, kind: 'front', amount: expense.amount });
  }

  for (const [memberId, share] of shares) {
    entries.push({ ...base, memberId, kind: 'share', amount: cents(-share) });
  }

  if (rounding !== 0 && collector.kind === 'member') {
    entries.push({ ...base, memberId: collector.memberId, kind: 'rounding', amount: rounding });
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
