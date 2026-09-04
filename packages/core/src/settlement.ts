import { chargeFor, surplusOf } from './codes.js';
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
}

export interface MemberSettlement {
  memberId: MemberId;
  name: string;
  code: number;
  /** Positive: the member receives. Negative: the member pays. */
  net: Cents;
  /** The fair share, zero when the member is owed money. Sums to zero across the event. */
  owed: Cents;
  /** What to actually ask for, carrying the identification code. Null when nothing is due. */
  charged: Cents | null;
  /** charged − owed, and it goes to the caixa. */
  surplus: Cents;
  lines: BreakdownLine[];
}

export interface Settlement {
  eventId: string;
  total: Cents;
  members: MemberSettlement[];
  /** The rounding the club collects on top of the fair shares. */
  treasurySurplus: Cents;
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
  let treasurySurplus = 0;

  for (const member of members) {
    const memberEntries = byMember.get(member.id) ?? [];
    if (memberEntries.length === 0) continue;

    const net = sum(memberEntries.map((entry) => entry.amount));
    const owed = net < 0 ? cents(-net) : ZERO;
    const charged = owed > 0 && !member.isTreasury ? chargeFor(owed, member.code) : null;
    const surplus = charged === null ? ZERO : surplusOf(owed, member.code);
    treasurySurplus += surplus;

    settlements.push({
      memberId: member.id,
      name: member.name,
      code: member.code,
      net,
      owed,
      charged,
      surplus,
      lines: linesFor(event, memberEntries),
    });
  }

  return {
    eventId: event.id,
    total: sum(event.expenses.map((expense) => expense.amount)),
    members: settlements,
    treasurySurplus: cents(treasurySurplus),
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
    const amount = share ? cents(-share.amount) : ZERO;

    lines.push({
      expenseId: expense.id,
      description: expense.description,
      amount,
      excluded: share !== undefined && amount === 0,
      fronted: front ? front.amount : ZERO,
    });
  }

  return lines;
}
