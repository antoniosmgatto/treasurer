import { entriesForEvent, type LedgerEntry } from './ledger.js';
import { cents, sum, ZERO, type Cents } from './money.js';
import { splitByWeight } from './split.js';
import { collectorId, type Collector, type Event, type Member, type MemberId } from './types.js';
import { assertValid } from './validate.js';

/** What the club is called when it collects a bill. The interface may translate it. */
export const CLUB_LABEL = 'Clube';

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

/** One transfer a member has to make: everything they owe to a single collector. */
export interface Payment {
  collector: Collector;
  /** The collector's name, or the club's label. */
  name: string;
  /** Where to send it, when the bill said. */
  key?: string | undefined;
  amount: Cents;
  /** The bills this payment covers, so a receipt can be argued against something. */
  expenseIds: string[];
}

/** One side of the same coin: what a collector is owed by everybody else. */
export interface CollectorSettlement {
  collector: Collector;
  name: string;
  key?: string | undefined;
  /** What they put in up front, across the event. */
  fronted: Cents;
  /** What the others owe them. Their own share of their own bills never appears here. */
  collecting: Cents;
  /** The centavos rounding up handed them. */
  rounding: Cents;
}

export interface MemberSettlement {
  memberId: MemberId;
  name: string;
  /** Absent for a guest, who holds no place in the club's numbering (D29). */
  code?: number;
  /** What they must transfer, across every collector. Zero when they owe nobody. */
  owed: Cents;
  /** What comes back to them for the bills they collect. */
  receiving: Cents;
  /** `receiving − owed`. Informational: the two sides are settled separately, not netted. */
  net: Cents;
  /** The centavos rounding up handed them, as a collector. */
  rounding: Cents;
  /** One entry per collector they owe. This is what they act on. */
  payments: Payment[];
  lines: BreakdownLine[];
}

export interface Settlement {
  eventId: string;
  total: Cents;
  members: MemberSettlement[];
  /** Everybody collecting something in this event, the club included. */
  collectors: CollectorSettlement[];
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

  const nameOf = new Map(members.map((member) => [member.id, member.name]));
  const owedTo = debtsByCollector(event);
  const collectors = collectorsOf(event, nameOf, owedTo);
  const byCollectorId = new Map(collectors.map((entry) => [collectorId(entry.collector), entry]));

  const settlements: MemberSettlement[] = [];

  for (const member of members) {
    const memberEntries = byMember.get(member.id) ?? [];
    const mine = owedTo.get(member.id);
    if (memberEntries.length === 0 && !mine) continue;

    const payments: Payment[] = [];
    for (const [id, debt] of mine ?? new Map()) {
      const collector = byCollectorId.get(id);
      if (!collector) continue;
      payments.push({
        collector: collector.collector,
        name: collector.name,
        key: collector.key,
        amount: debt.amount,
        expenseIds: debt.expenseIds,
      });
    }

    const owed = sum(payments.map((payment) => payment.amount));
    const asCollector = byCollectorId.get(member.id);
    const receiving = asCollector ? asCollector.collecting : ZERO;
    const rounding = sum(
      memberEntries.filter((entry) => entry.kind === 'rounding').map((entry) => entry.amount),
    );

    settlements.push({
      memberId: member.id,
      name: member.name,
      ...(member.code === undefined ? {} : { code: member.code }),
      owed,
      receiving,
      net: cents(receiving - owed),
      rounding,
      payments,
      lines: linesFor(event, memberEntries),
    });
  }

  return {
    eventId: event.id,
    total: sum(event.expenses.map((expense) => expense.amount)),
    members: settlements,
    collectors,
    rounding: sum(collectors.map((entry) => entry.rounding)),
    entries,
  };
}

interface Debt {
  amount: Cents;
  expenseIds: string[];
}

/**
 * Who owes what to whom. A member's share of a bill goes to that bill's collector, and a
 * collector never owes themselves — their own share is already covered by what they fronted.
 *
 * Debts are gross, never netted between two people: if each collects a bill the other took part
 * in, both transfers happen. Netting would save a transfer and cost the thing that matters — a
 * payment that lines up with one collector's bills, which is what a receipt has to prove.
 */
function debtsByCollector(event: Event): Map<MemberId, Map<string, Debt>> {
  const owed = new Map<MemberId, Map<string, Debt>>();

  for (const expense of event.expenses) {
    const { shares } = splitByWeight(expense.amount, expense.participants);
    const collector = collectorId(expense.collector);

    for (const [memberId, share] of shares) {
      if (share === 0 || memberId === collector) continue;

      const forMember = owed.get(memberId) ?? new Map<string, Debt>();
      const existing = forMember.get(collector);
      forMember.set(collector, {
        amount: cents((existing?.amount ?? 0) + share),
        expenseIds: [...(existing?.expenseIds ?? []), expense.id],
      });
      owed.set(memberId, forMember);
    }
  }

  return owed;
}

function collectorsOf(
  event: Event,
  nameOf: Map<MemberId, string>,
  owedTo: Map<MemberId, Map<string, Debt>>,
): CollectorSettlement[] {
  const collecting = new Map<string, Cents>();
  for (const debts of owedTo.values()) {
    for (const [id, debt] of debts) {
      collecting.set(id, cents((collecting.get(id) ?? 0) + debt.amount));
    }
  }

  const found = new Map<string, CollectorSettlement>();

  for (const expense of event.expenses) {
    const id = collectorId(expense.collector);
    const { rounding } = splitByWeight(expense.amount, expense.participants);
    const existing = found.get(id);

    found.set(id, {
      collector: expense.collector,
      name:
        expense.collector.kind === 'club'
          ? CLUB_LABEL
          : (nameOf.get(expense.collector.memberId) ?? expense.collector.memberId),
      // The last bill wins: a collector who retypes their key has changed it (D8).
      key: expense.collectionKey ?? existing?.key,
      fronted: cents((existing?.fronted ?? 0) + expense.amount),
      collecting: collecting.get(id) ?? ZERO,
      rounding: cents((existing?.rounding ?? 0) + rounding),
    });
  }

  return [...found.values()];
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
