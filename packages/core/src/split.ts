import { cents, ZERO, type Cents } from './money.js';
import type { MemberId, Participant } from './types.js';

export interface Split {
  shares: ReadonlyMap<MemberId, Cents>;
  /** What flooring left over — 0 to (participants − 1) cents. Absorbed by the payer. */
  remainder: Cents;
}

/**
 * Divides an amount by weight, flooring every share so no cent is invented, and reporting the
 * leftover separately rather than smearing it across members.
 */
export function splitByWeight(amount: Cents, participants: readonly Participant[]): Split {
  const shares = new Map<MemberId, Cents>();
  let totalWeight = 0;
  for (const participant of participants) {
    if (!Number.isInteger(participant.weight) || participant.weight < 0) {
      throw new RangeError(`Weight must be a non-negative integer, received ${participant.weight}`);
    }
    totalWeight += participant.weight;
  }

  if (totalWeight === 0) {
    for (const participant of participants) shares.set(participant.memberId, ZERO);
    return { shares, remainder: amount };
  }

  let allocated = 0;
  for (const participant of participants) {
    const share = Math.floor((amount * participant.weight) / totalWeight);
    shares.set(participant.memberId, cents(share));
    allocated += share;
  }

  return { shares, remainder: cents(amount - allocated) };
}
