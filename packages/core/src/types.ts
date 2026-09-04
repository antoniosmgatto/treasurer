import type { Cents } from './money.js';

export type MemberId = string;

/** A permanent two-digit identification code, 1–99. Never reused once retired (D7). */
export type MemberCode = number;

export interface Member {
  id: MemberId;
  name: string;
  code: MemberCode;
  /** Set when the member leaves. Their code retires with them and is never reallocated. */
  retiredAt?: string;
}

export interface Participant {
  memberId: MemberId;
  /** 0 excludes, 1 is a normal share, 2 covers a guest. Halves are handled by scaling both. */
  weight: number;
}

export interface Expense {
  id: string;
  description: string;
  /** Whoever fronted the money, and who the shares are collected for. */
  payerId: MemberId;
  amount: Cents;
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
