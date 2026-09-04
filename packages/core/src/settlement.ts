import { entriesForEvent, type LedgerEntry } from './ledger.js';
import { cents, sum, ZERO, type Cents } from './money.js';
import type { Event, Member, MemberId } from './types.js';
import { assertValid } from './validate.js';

export interface BreakdownLine {
  expenseId: string;
  description: string;
  /** The member's share of this expense. Zero when they were present but excluded. */
  amount: Cents;
  /** D1: an exclusion is shown, never dropped — a missing line reads as a mistake. */
  excluded: boolean;
  /** What the member fronted for this expense, if anything. */
  fronted: Cents;
  /** What rounding the shares up handed the member, as the one collecting this bill. */
  rounding: Cents;
}

export interface MemberSettlement {
  memberId: MemberId;
  name: string;
  code: number;
  /** Positive: the member receives. Negative: the member pays. */
  net: Cents;
  /** What to ask the member for, zero when they are owed money instead. */
  owed: Cents;
  /** The centavos rounding up handed them across the event, for the bills they collect. */
  rounding: Cents;
  lines: BreakdownLine[];
}

export interface Settlement {
  eventId: string;
  total: Cents;
  members: MemberSettlement[];
  /** What rounding up added across the whole event. It sits with the collectors, not with us. */
  rounding: Cents;
  entries: LedgerEntry[];
}

export function settle(event: Event, members: readonly Member[]): Settlement {
  assertValid(event, members);

  const entries = entriesForEvent(event);
  const byMember = new Map<MemberId, LedgerEntry[]>();
  for (const entry of entries) {
    const existing = byMember.get(entry.memberId);
    if (existing) existing.push(entry);
    else byMember.set(entry.memberId, [entry]);
  }

  const settlements: MemberSettlement[] = [];
  let eventRounding = 0;

  for (const member of members) {
    const memberEntries = byMember.get(member.id) ?? [];
    if (memberEntries.length === 0) continue;

    const net = sum(memberEntries.map((entry) => entry.amount));
    const owed = net < 0 ? cents(-net) : ZERO;
    const rounding = sum(
      memberEntries.filter((entry) => entry.kind === 'rounding').map((entry) => entry.amount),
    );
    eventRounding += rounding;

    settlements.push({
      memberId: member.id,
      name: member.name,
      code: member.code,
      net,
      owed,
      rounding,
      lines: linesFor(event, memberEntries),
    });
  }

  return {
    eventId: event.id,
    total: sum(event.expenses.map((expense) => expense.amount)),
    members: settlements,
    rounding: cents(eventRounding),
    entries,
  };
}

function linesFor(event: Event, memberEntries: readonly LedgerEntry[]): BreakdownLine[] {
  const lines: BreakdownLine[] = [];

  for (const expense of event.expenses) {
    const forExpense = memberEntries.filter((entry) => entry.expenseId === expense.id);
    if (forExpense.length === 0) continue;

    const share = forExpense.find((entry) => entry.kind === 'share');
    const front = forExpense.find((entry) => entry.kind === 'front');
    const rounding = forExpense.find((entry) => entry.kind === 'rounding');
    const amount = share ? cents(-share.amount) : ZERO;

    lines.push({
      expenseId: expense.id,
      description: expense.description,
      amount,
      excluded: share !== undefined && amount === 0,
      fronted: front ? front.amount : ZERO,
      rounding: rounding ? rounding.amount : ZERO,
    });
  }

  return lines;
}
