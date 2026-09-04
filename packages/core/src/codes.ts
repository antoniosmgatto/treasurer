import type { MemberCode } from './types.js';

export const MIN_CODE = 1;
export const MAX_CODE = 99;

/**
 * A permanent two-digit identifier for a member, never reused once retired (D7).
 *
 * It is not part of any amount today: charges are the member's exact share, rounded up to the
 * cent. The code is what a collector who links a bank account can later write into the cents of
 * their own charges, so an incoming transfer names its payer whoever's account it came from.
 *
 * 0 is rejected: a charge ending in ,00 is indistinguishable from one carrying no code.
 */
export function isValidCode(code: number): boolean {
  return Number.isInteger(code) && code >= MIN_CODE && code <= MAX_CODE;
}

export function formatCode(code: MemberCode): string {
  return String(code).padStart(2, '0');
}
