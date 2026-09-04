import { cents, ZERO, type Cents } from './money.js';
import type { MemberId, Participant } from './types.js';

export interface Split {
  shares: ReadonlyMap<MemberId, Cents>;
  /**
   * What the rounding left over, from the collector's side: positive when the shares add up to
   * more than the bill, negative when nobody carries a share and the collector absorbs all of it.
   * Never hidden inside a share, because it is somebody's money and D1 says rounding is shown.
   */
  rounding: Cents;
}

/**
 * Divides an amount by weight, rounding every share up so the shares always cover the bill and
 * whoever collects is never left short. Rounding up is the deliberate direction: a collector who
 * fronted R$158,73 of his own money should not end the event a few centavos down.
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
    return { shares, rounding: cents(-amount) };
  }

  let allocated = 0;
  for (const participant of participants) {
    const share = Math.ceil((amount * participant.weight) / totalWeight);
    shares.set(participant.memberId, cents(share));
    allocated += share;
  }

  return { shares, rounding: cents(allocated - amount) };
}
