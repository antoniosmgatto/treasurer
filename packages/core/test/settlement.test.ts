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

  it('pays back the two members who fronted money', () => {
    // 155,00 fronted − 47,51 own share.
    expect(formatBRL(forMember('m01').net)).toBe('R$ 107,49');
    // 158,73 fronted − 47,51 own share − 0,03 flooring remainder they absorb as payer.
    expect(formatBRL(forMember('m02').net)).toBe('R$ 111,19');
  });

  it('recovers what the caixa fronted, less the remainder it absorbs', () => {
    expect(formatBRL(forMember('caixa').net)).toBe('R$ 161,40');
    expect(forMember('caixa').charged).toBeNull();
  });

  it('charges everyone else the same share', () => {
    for (const id of ['m03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10']) {
      expect(formatBRL(forMember(id).owed)).toBe('R$ 47,51');
    }
  });

  it('writes each identification code into the amount asked for', () => {
    expect(formatBRL(forMember('m03').charged!)).toBe('R$ 48,03');
    expect(formatBRL(forMember('m07').charged!)).toBe('R$ 48,07');
    expect(formatBRL(forMember('m10').charged!)).toBe('R$ 48,10');
  });

  it('keeps every charge distinct, which is the entire point', () => {
    const charged = settlement.members
      .map((member) => member.charged)
      .filter((amount): amount is NonNullable<typeof amount> => amount !== null);
    expect(new Set(charged).size).toBe(charged.length);
  });

  it('collects the rounding surplus for the caixa, and it is not small', () => {
    // Eight payers, each rounded up to R$48 plus their code.
    expect(formatBRL(settlement.treasurySurplus)).toBe('R$ 4,44');
  });

  it('shows every line to every member, including the ones they paid nothing for', () => {
    const lines = forMember('m03').lines;
    expect(lines.map((line) => line.description)).toEqual(['Carne', 'Mercado (janta)', 'Compras']);
    expect(lines.every((line) => !line.excluded)).toBe(true);
  });
});

describe('settle — invariants', () => {
  it('the fair shares sum to zero', () => {
    expect(sum(settlement.members.map((member) => member.net))).toBe(0);
  });

  it('the surplus is exactly what is charged above what is owed', () => {
    const owed = sum(settlement.members.filter((m) => m.owed > 0).map((m) => m.owed));
    const charged = sum(
      settlement.members.filter((m) => m.charged !== null).map((m) => m.charged!),
    );
    expect(charged - owed).toBe(settlement.treasurySurplus);
  });

  it('nobody is ever asked for less than they owe', () => {
    for (const member of settlement.members) {
      if (member.charged !== null) expect(member.charged).toBeGreaterThanOrEqual(member.owed);
    }
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
      { expenseId: 'cerveja', description: 'Cerveja', amount: 0, excluded: true, fronted: 0 },
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
        .filter((member) => !member.isTreasury)
        .slice(0, 2 + random(9))
        .map((member) => ({ memberId: member.id, weight: random(3) }));
      if (participants.every((participant) => participant.weight === 0)) continue;

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
  it('rejects a caixa that carries a share', () => {
    const broken: Event = {
      ...acampamento,
      expenses: [
        {
          ...acampamento.expenses[0]!,
          participants: [{ memberId: 'caixa', weight: 1 }],
        },
      ],
    };
    expect(() => settle(broken, members)).toThrow(/caixa cannot take a share/);
  });

  it('rejects two members sharing an identification code', () => {
    const clashing: Member[] = [
      ...members.slice(0, -1),
      { id: 'm11', name: 'Membro 11', code: 1, isTreasury: false },
    ];
    expect(() => settle(acampamento, clashing)).toThrow(/Code 1 is shared/);
  });

  it('rejects a club with no caixa', () => {
    const noTreasury = members.filter((member) => !member.isTreasury);
    expect(() => settle(acampamento, noTreasury)).toThrow(/No treasury row/);
  });
});
