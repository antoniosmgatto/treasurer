import type { Cents } from './money.js';

export type MemberId = string;

/** A permanent two-digit identification code, 1–99. Never reused once retired (D7). */
export type MemberCode = number;

export interface Member {
  id: MemberId;
  name: string;
  /**
   * Absent for a guest, who is on one event and holds no place in the club. Codes are the club's
   * own numbering and a guest never takes one — D7 keeps them scarce and permanent.
   */
  code?: MemberCode;
  /** The event a guest belongs to. Set only for guests, who exist nowhere else. */
  guestOf?: string;
  /** Set when the member leaves. Their code retires with them and is never reallocated. */
  retiredAt?: string;
}

export function isGuest(member: Member): boolean {
  return member.guestOf !== undefined;
}

export interface Participant {
  memberId: MemberId;
  /** 0 excludes, 1 is a normal share, 2 covers a guest. Halves are handled by scaling both. */
  weight: number;
}

/**
 * Who fronted a bill and collects the shares back for it. Chosen by whoever adds the bill: their
 * own key, or the club's.
 *
 * The club is a label with a key, never a member row and never a balance (D25). "Collected by the
 * club" means the club's money paid for it — if a member fronts a bill and the club collects on
 * his behalf, the club owes him, and that obligation is the standing fund this project deleted.
 */
export type Collector = { kind: 'member'; memberId: MemberId } | { kind: 'club' };

export const CLUB: Collector = { kind: 'club' };

export function isSameCollector(a: Collector, b: Collector): boolean {
  if (a.kind === 'club' || b.kind === 'club') return a.kind === b.kind;
  return a.memberId === b.memberId;
}

/** A stable key for grouping payments by who receives them. */
export function collectorId(collector: Collector): string {
  return collector.kind === 'club' ? 'club' : collector.memberId;
}

export interface Expense {
  id: string;
  description: string;
  /** Who fronted the money and collects it back. */
  collector: Collector;
  /**
   * Where to send the money — a Pix key, typed when the bill is added. Per collector per event:
   * the same person may collect to a different key on another trip.
   */
  collectionKey?: string;
  /** What the members are charged, and the only number that is split. */
  amount: Cents;
  /**
   * What the paperwork says, when it says something different. The meat receipt read R$161,47
   * and the buyer asked for R$155,00 because he rounded in the group's favour: both numbers are
   * true, and a model that holds one of them makes somebody look wrong.
   */
  receiptTotal?: Cents;
  participants: readonly Participant[];
  receiptUrl?: string;
}

export interface Event {
  id: string;
  name: string;
  /** ISO date of the occasion, not of data entry. */
  date: string;
  status: 'open' | 'settled';
  expenses: readonly Expense[];
}
