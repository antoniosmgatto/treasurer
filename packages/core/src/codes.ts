import { cents, type Cents } from './money.js';
import type { MemberCode } from './types.js';

export const MIN_CODE = 1;
export const MAX_CODE = 99;

/** 0 is rejected: a charge ending in ,00 is indistinguishable from one carrying no code. */
export function isValidCode(code: number): boolean {
  return Number.isInteger(code) && code >= MIN_CODE && code <= MAX_CODE;
}

export function formatCode(code: MemberCode): string {
  return String(code).padStart(2, '0');
}

/**
 * Rounds the amount owed up to the whole real and writes the member's code into the cents, so
 * every incoming line in the statement identifies its payer regardless of the sending account.
 *
 * R$47,51 for member 03 becomes R$48,03. The difference is surplus, and it belongs to the
 * treasury — visibly, never silently (D1).
 */
export function chargeFor(owed: Cents, code: MemberCode): Cents {
  if (owed <= 0) throw new RangeError('Only a member who owes money can be charged');
  if (!isValidCode(code)) throw new RangeError(`Identification code out of range: ${code}`);
  const fraction = owed % 100;
  const wholeUnits = fraction === 0 ? owed : owed + (100 - fraction);
  return cents(wholeUnits + code);
}

export function surplusOf(owed: Cents, code: MemberCode): Cents {
  return cents(chargeFor(owed, code) - owed);
}
