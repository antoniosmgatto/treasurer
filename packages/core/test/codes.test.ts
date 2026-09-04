import { describe, expect, it } from 'vitest';
import { chargeFor, formatCode, isValidCode, surplusOf } from '../src/codes.js';
import { cents } from '../src/money.js';

describe('identification codes', () => {
  it('writes the code into the cents', () => {
    expect(chargeFor(cents(1587), 3)).toBe(1603);
    expect(chargeFor(cents(1587), 11)).toBe(1611);
    expect(chargeFor(cents(4751), 3)).toBe(4803);
  });

  it('always rounds up, so a charge never falls short of what is owed', () => {
    for (let owed = 1; owed <= 500; owed++) {
      for (const code of [1, 7, 42, 99]) {
        expect(chargeFor(cents(owed), code)).toBeGreaterThan(owed);
      }
    }
  });

  it('adds a whole unit when the amount is already round', () => {
    // 47,00 owed cannot be charged as 47,00 — the cents are the code.
    expect(chargeFor(cents(4700), 5)).toBe(4705);
  });

  it('reports the surplus that the caixa collects', () => {
    expect(surplusOf(cents(4751), 1)).toBe(50);
    expect(surplusOf(cents(4751), 15)).toBe(64);
    expect(surplusOf(cents(1587), 3)).toBe(16);
  });

  it('rejects code 00, which is indistinguishable from no code at all', () => {
    expect(isValidCode(0)).toBe(false);
    expect(isValidCode(1)).toBe(true);
    expect(isValidCode(99)).toBe(true);
    expect(isValidCode(100)).toBe(false);
    expect(() => chargeFor(cents(4751), 0)).toThrow(RangeError);
  });

  it('refuses to charge someone who is owed money', () => {
    expect(() => chargeFor(cents(0), 3)).toThrow(RangeError);
    expect(() => chargeFor(cents(-10_748), 3)).toThrow(RangeError);
  });

  it('formats two digits', () => {
    expect(formatCode(3)).toBe('03');
    expect(formatCode(15)).toBe('15');
  });
});
