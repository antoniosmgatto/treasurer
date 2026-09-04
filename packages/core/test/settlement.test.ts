import { describe, expect, it } from 'vitest';
import { formatBRL, sum } from '../src/money.js';
import { settle } from '../src/settlement.js';
import type { Event, Member } from '../src/types.js';
import { acampamento, members } from './fixture.js';

const settlement = settle(acampamento, members);
const forMember = (id: string) => {
  const found = settlement.members.find((member) => member.memberId === id);
  if (!found) throw new Error(`No settlement for ${id}`);
  return found;
};

describe('settle — the reference event', () => {
  it('totals the three expenses', () => {
    expect(formatBRL(settlement.total)).toBe('R$ 475,20');
  });

  it('charges everyone the same share, rounded up', () => {
    // 15,50 + 15,88 + 16,15 — each bill divided by ten and rounded up to the cent.
    for (const id of ['m04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10']) {
      expect(formatBRL(forMember(id).owed)).toBe('R$ 47,53');
    }
  });

  it('pays back the three members who fronted money, rounding included', () => {
    // 155,00 fronted − 47,53 own share; the bill divided evenly, so no rounding.
    expect(formatBRL(forMember('m01').net)).toBe('R$ 107,47');
    // 158,73 fronted − 47,53 own share + 0,07 the rounding handed him.
    expect(formatBRL(forMember('m02').net)).toBe('R$ 111,27');
    // 161,47 fronted − 47,53 own share + 0,03 rounding.
    expect(formatBRL(forMember('m03').net)).toBe('R$ 113,97');
  });

  it('gives the rounding to the collectors, not to the club', () => {
    expect(formatBRL(settlement.rounding)).toBe('R$ 0,10');
    expect(formatBRL(forMember('m02').rounding)).toBe('R$ 0,07');
    expect(formatBRL(forMember('m03').rounding)).toBe('R$ 0,03');
    // He fronted a bill that divided evenly, so there was nothing to round.
    expect(forMember('m01').rounding).toBe(0);
  });

  it('shows every line to every member, including the ones they paid nothing for', () => {
    const lines = forMember('m04').lines;
    expect(lines.map((line) => line.description)).toEqual(['Carne', 'Mercado (janta)', 'Compras']);
    expect(lines.every((line) => !line.excluded)).toBe(true);
  });
});

describe('settle — invariants', () => {
  it('the fair shares sum to zero', () => {
    expect(sum(settlement.members.map((member) => member.net))).toBe(0);
  });

  it('every bill is covered by the shares charged for it', () => {
    for (const expense of acampamento.expenses) {
      const charged = sum(
        settlement.entries
          .filter((entry) => entry.expenseId === expense.id && entry.kind === 'share')
          .map((entry) => -entry.amount as typeof entry.amount),
      );
      expect(charged).toBeGreaterThanOrEqual(expense.amount);
    }
  });

  it('the rounding is exactly what was collected above the bills', () => {
    const charged = sum(
      settlement.entries
        .filter((entry) => entry.kind === 'share')
        .map((entry) => -entry.amount as typeof entry.amount),
    );
    expect(charged - settlement.total).toBe(settlement.rounding);
  });
});

describe('settle — exclusions are visible', () => {
  const withOwnBeer: Event = {
    ...acampamento,
    id: 'churrasco',
    expenses: [
      {
        id: 'cerveja',
        description: 'Cerveja',
        payerId: 'm01',
        amount: 6000 as never,
        participants: [
          { memberId: 'm01', weight: 1 },
          { memberId: 'm02', weight: 1 },
          { memberId: 'm03', weight: 0 },
        ],
      },
    ],
  };

  it('renders a zero line rather than dropping the member', () => {
    const result = settle(withOwnBeer, members);
    const excluded = result.members.find((member) => member.memberId === 'm03');
    expect(excluded?.lines).toEqual([
      {
        expenseId: 'cerveja',
        description: 'Cerveja',
        amount: 0,
        excluded: true,
        fronted: 0,
        rounding: 0,
      },
    ]);
    expect(excluded?.owed).toBe(0);
  });
});

describe('settle — random events always balance', () => {
  let seed = 20_260_903;
  const random = (max: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % max;
  };

  it('credits equal debits for a thousand generated events', () => {
    for (let round = 0; round < 1000; round++) {
      const participants = members
        .slice(0, 2 + random(9))
        .map((member) => ({ memberId: member.id, weight: random(3) }));

      const payers = [...members];
      const event: Event = {
        id: `generated-${round}`,
        name: 'Generated',
        date: '2026-09-03',
        status: 'open',
        expenses: Array.from({ length: 1 + random(4) }, (_, index) => ({
          id: `e${index}`,
          description: `Despesa ${index}`,
          payerId: payers[random(payers.length)]!.id,
          amount: (1 + random(50_000)) as never,
          participants,
        })),
      };

      const result = settle(event, members);
      expect(sum(result.members.map((member) => member.net))).toBe(0);
    }
  });
});

describe('settle — validation', () => {
  it('rejects two members sharing an identification code', () => {
    const clashing: Member[] = [...members.slice(0, -1), { id: 'm11', name: 'Membro 11', code: 1 }];
    expect(() => settle(acampamento, clashing)).toThrow(/Code 1 is shared/);
  });

  it('rejects an expense whose payer is nobody', () => {
    const broken: Event = {
      ...acampamento,
      expenses: [{ ...acampamento.expenses[0]!, payerId: 'ninguem' }],
    };
    expect(() => settle(broken, members)).toThrow(/unknown payer/);
  });
});
