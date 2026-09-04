import { describe, expect, it } from 'vitest';
import { cents } from '../src/money.js';
import { splitByWeight } from '../src/split.js';

const people = (count: number, weight = 1) =>
  Array.from({ length: count }, (_, index) => ({ memberId: `m${index}`, weight }));

describe('splitByWeight', () => {
  it('divides evenly when it can', () => {
    const { shares, remainder } = splitByWeight(cents(15_500), people(10));
    expect([...shares.values()]).toEqual(Array(10).fill(1550));
    expect(remainder).toBe(0);
  });

  it('floors every share and reports the leftover instead of inventing cents', () => {
    const { shares, remainder } = splitByWeight(cents(15_873), people(10));
    expect([...shares.values()]).toEqual(Array(10).fill(1587));
    expect(remainder).toBe(3);
  });

  it('honours weights: 0 excludes, 2 covers a guest', () => {
    const { shares, remainder } = splitByWeight(cents(400), [
      { memberId: 'a', weight: 1 },
      { memberId: 'b', weight: 0 },
      { memberId: 'c', weight: 2 },
    ]);
    expect(shares.get('a')).toBe(133);
    expect(shares.get('b')).toBe(0);
    expect(shares.get('c')).toBe(266);
    expect(remainder).toBe(1);
  });

  it('gives everything to the remainder when nobody carries weight', () => {
    const { shares, remainder } = splitByWeight(cents(16_147), people(3, 0));
    expect([...shares.values()]).toEqual([0, 0, 0]);
    expect(remainder).toBe(16_147);
  });

  it('never allocates more than the amount', () => {
    for (let amount = 0; amount < 400; amount++) {
      for (let count = 1; count <= 12; count++) {
        const { shares, remainder } = splitByWeight(cents(amount), people(count));
        const allocated = [...shares.values()].reduce((total, share) => total + share, 0);
        expect(allocated + remainder).toBe(amount);
        expect(remainder).toBeLessThan(count);
      }
    }
  });

  it('rejects fractional and negative weights', () => {
    expect(() => splitByWeight(cents(100), [{ memberId: 'a', weight: 0.5 }])).toThrow(RangeError);
    expect(() => splitByWeight(cents(100), [{ memberId: 'a', weight: -1 }])).toThrow(RangeError);
  });
});
