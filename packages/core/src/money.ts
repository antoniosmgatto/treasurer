/**
 * Money is integer cents, always. Floats never touch an amount.
 *
 * The brand stops a raw `number` being passed where an amount is expected, which is the
 * mistake that silently turns 47.51 into 4751 or 0.4751 somewhere downstream.
 */

declare const centsBrand: unique symbol;

export type Cents = number & { readonly [centsBrand]: 'Cents' };

export const ZERO = 0 as Cents;

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amounts must be whole cents, received ${value}`);
  }
  // Normalize -0, which compares equal to 0 but renders as "-0" and fails deep equality.
  return (value === 0 ? 0 : value) as Cents;
}

export function add(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negate(value: Cents): Cents {
  return cents(-value);
}

export function sum(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) total += value;
  return cents(total);
}

/** Formats as pt-BR currency without ever dividing, so no float can round the display. */
export function formatBRL(value: Cents): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}R$ ${whole.toLocaleString('pt-BR')},${String(fraction).padStart(2, '0')}`;
}

/**
 * Accepts "155,00", "R$ 155,00", "155.00" and "155".
 *
 * A dot is ambiguous in pt-BR: "1.234" is a thousands separator but "161.47" is how a keyboard
 * habit writes cents. We read a lone dot with one or two trailing digits as a decimal point,
 * and treat every other dot as grouping.
 */
export function parseBRL(input: string): Cents {
  const trimmed = input.replace(/[R$\s]/g, '');
  const dotIsDecimal = !trimmed.includes(',') && /^-?\d+\.\d{1,2}$/.test(trimmed);
  const cleaned = dotIsDecimal ? trimmed : trimmed.replace(/\./g, '').replace(',', '.');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new SyntaxError(`Not an amount: ${input}`);
  const [, sign, whole, fraction = '0'] = match;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents(sign === '-' ? -value : value);
}
