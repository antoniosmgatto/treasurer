import { describe, expect, it } from 'vitest';
import { cents, formatBRL, parseBRL, sum } from '../src/money.js';

describe('money', () => {
  it('refuses anything that is not whole cents', () => {
    expect(() => cents(47.51)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
  });

  it('formats pt-BR without dividing', () => {
    expect(formatBRL(cents(4751))).toBe('R$ 47,51');
    expect(formatBRL(cents(4805))).toBe('R$ 48,05');
    expect(formatBRL(cents(100))).toBe('R$ 1,00');
    expect(formatBRL(cents(7))).toBe('R$ 0,07');
    expect(formatBRL(cents(-10748))).toBe('-R$ 107,48');
    expect(formatBRL(cents(123_456_789))).toBe('R$ 1.234.567,89');
  });

  it('parses the shapes a person actually types', () => {
    expect(parseBRL('155,00')).toBe(15_500);
    expect(parseBRL('R$ 158,73')).toBe(15_873);
    expect(parseBRL('161.47')).toBe(16_147);
    expect(parseBRL('47')).toBe(4700);
    expect(parseBRL('0,07')).toBe(7);
    expect(() => parseBRL('quinze reais')).toThrow(SyntaxError);
  });

  it('round-trips through formatting', () => {
    for (const value of [0, 1, 99, 100, 4751, 15_873, 999_999]) {
      expect(parseBRL(formatBRL(cents(value)))).toBe(value);
    }
  });

  it('sums', () => {
    expect(sum([cents(15_500), cents(15_873), cents(16_147)])).toBe(47_520);
    expect(sum([])).toBe(0);
  });
});
