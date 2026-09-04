import { describe, expect, it } from 'vitest';
import { formatCode, isValidCode } from '../src/codes.js';

describe('identification codes', () => {
  it('rejects code 00, which is indistinguishable from no code at all', () => {
    expect(isValidCode(0)).toBe(false);
    expect(isValidCode(1)).toBe(true);
    expect(isValidCode(99)).toBe(true);
    expect(isValidCode(100)).toBe(false);
  });

  it('rejects anything that is not a whole code', () => {
    expect(isValidCode(3.5)).toBe(false);
    expect(isValidCode(-3)).toBe(false);
  });

  it('formats two digits', () => {
    expect(formatCode(3)).toBe('03');
    expect(formatCode(15)).toBe('15');
  });
});
