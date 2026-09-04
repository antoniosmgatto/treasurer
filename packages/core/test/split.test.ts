import { describe, expect, it } from 'vitest';
import { cents } from '../src/money.js';
import { participantsFor, splitByWeight } from '../src/split.js';

const people = (count: number, weight = 1) =>
  Array.from({ length: count }, (_, index) => ({ memberId: `m${index}`, weight }));

describe('splitByWeight', () => {
  it('divides evenly when it can', () => {
    const { shares, rounding } = splitByWeight(cents(15_500), people(10));
    expect([...shares.values()]).toEqual(Array(10).fill(1550));
    expect(rounding).toBe(0);
  });

  it('rounds every share up so the shares cover the bill', () => {
    const { shares, rounding } = splitByWeight(cents(15_873), people(10));
    expect([...shares.values()]).toEqual(Array(10).fill(1588));
    // R$158,80 collected against a R$158,73 bill: seven centavos for whoever fronted it.
    expect(rounding).toBe(7);
  });

  it('honours weights: 0 excludes, 2 covers a guest', () => {
    const { shares, rounding } = splitByWeight(cents(400), [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 0 },
      { memberId: 'c', weight: 2 },
    ]);
    expect(shares.get('a')).toBe(134);
    expect(shares.get('b')).toBe(0);
    expect(shares.get('c')).toBe(267);
    expect(rounding).toBe(1);
  });

  it('leaves the whole bill with the collector when nobody carries weight', () => {
    const { shares, rounding } = splitByWeight(cents(16_147), people(3, 0));
    expect([...shares.values()]).toEqual([0, 0, 0]);
    // Negative: the shares fall short of the bill, and the shortfall is the collector's.
    expect(rounding).toBe(-16_147);
  });

  it('never collects less than the amount, and never much more', () => {
    for (let amount = 0; amount < 400; amount++) {
      for (let count = 1; count <= 12; count++) {
        const { shares, rounding } = splitByWeight(cents(amount), people(count));
        const allocated = [...shares.values()].reduce((total, share) => total + share, 0);
        expect(allocated - rounding).toBe(amount);
        expect(rounding).toBeGreaterThanOrEqual(0);
        expect(rounding).toBeLessThan(count);
      }
    }
  });

  it('rejects fractional and negative weights', () => {
    expect(() => splitByWeight(cents(100), [{ memberId: 'a', weight: 0.5 }])).toThrow(RangeError);
    expect(() => splitByWeight(cents(100), [{ memberId: 'a', weight: -1 }])).toThrow(RangeError);
  });
});

describe('participantsFor', () => {
  const roster = [
    { memberId: 'm01', weight: 1 },
    { memberId: 'm02', weight: 1 },
    { memberId: 'm03', weight: 1 },
  ];

  it('stores nothing when everybody is in — the roster already says so (D12)', () => {
    expect(participantsFor(roster, new Set(['m01', 'm02', 'm03']))).toEqual([]);
  });

  it('writes the whole list down when somebody is out, at weight 0 (D1)', () => {
    expect(participantsFor(roster, new Set(['m01', 'm02']))).toEqual([
      { memberId: 'm01', weight: 1 },
      { memberId: 'm02', weight: 1 },
      { memberId: 'm03', weight: 0 },
    ]);
  });

  it('keeps a weight the roster already carried', () => {
    const withGuest = [...roster, { memberId: 'm04', weight: 2 }];
    expect(participantsFor(withGuest, new Set(['m01', 'm04']))).toEqual([
      { memberId: 'm01', weight: 1 },
      { memberId: 'm02', weight: 0 },
      { memberId: 'm03', weight: 0 },
      { memberId: 'm04', weight: 2 },
    ]);
  });

  it('excludes everybody rather than throwing when nobody is ticked', () => {
    expect(participantsFor(roster, new Set())).toEqual([
      { memberId: 'm01', weight: 0 },
      { memberId: 'm02', weight: 0 },
      { memberId: 'm03', weight: 0 },
    ]);
  });

  it('has nothing to store for an empty roster', () => {
    expect(participantsFor([], new Set(['m01']))).toEqual([]);
  });
});
