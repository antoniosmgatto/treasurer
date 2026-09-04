import { describe, expect, it } from 'vitest';
import { parseEventFile, ParseError } from '../src/parse.js';

const valid = {
  members: [{ id: 'm01', name: 'Membro 01', code: 1 }],
  event: {
    id: 'churrasco',
    name: 'Churrasco',
    date: '2026-09-12',
    expenses: [
      {
        id: 'carne',
        description: 'Carne',
        payerId: 'm01',
        amount: '155,00',
        participants: ['m01'],
      },
    ],
  },
};

describe('parseEventFile', () => {
  it('reads amounts written the way a person types them', () => {
    const { event } = parseEventFile(valid);
    expect(event.expenses[0]!.amount).toBe(15_500);
  });

  it('accepts raw cents too', () => {
    const withCents = structuredClone(valid);
    withCents.event.expenses[0]!.amount = 15_500 as never;
    expect(parseEventFile(withCents).event.expenses[0]!.amount).toBe(15_500);
  });

  it('treats a bare member id as a full share', () => {
    expect(parseEventFile(valid).event.expenses[0]!.participants).toEqual([
      { memberId: 'm01', weight: 1 },
    ]);
  });

  it('defaults the status to open', () => {
    const parsed = parseEventFile(valid);
    expect(parsed.event.status).toBe('open');
  });

  it('names what the person got wrong', () => {
    const broken = structuredClone(valid);
    broken.event.expenses[0]!.amount = 'quinze reais';
    expect(() => parseEventFile(broken)).toThrow(/expenses\[0\]\.amount/);
    expect(() => parseEventFile(broken)).toThrow(ParseError);
  });

  it('rejects a file that is not the expected shape', () => {
    expect(() => parseEventFile(null)).toThrow(/Expected a JSON object/);
    expect(() => parseEventFile({ members: [] })).toThrow(/event: expected an object/);
    expect(() => parseEventFile({ event: {} })).toThrow(/members: expected an array/);
  });
});
