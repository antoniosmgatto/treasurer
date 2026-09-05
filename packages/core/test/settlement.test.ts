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

  it('splits what was asked for, not what the nota says', () => {
    const carne = acampamento.expenses.find((expense) => expense.id === 'carne')!;
    expect(formatBRL(carne.receiptTotal!)).toBe('R$ 161,47');
    expect(formatBRL(carne.amount)).toBe('R$ 155,00');
    // Ten shares of the charged amount, and the receipt total never enters the arithmetic.
    const line = forMember('m04').lines.find((entry) => entry.expenseId === 'carne')!;
    expect(formatBRL(line.amount)).toBe('R$ 15,50');
  });

  it('charges everyone the same share, rounded up', () => {
    // 15,50 + 15,88 + 16,15 — each bill divided by ten and rounded up to the cent.
    for (const id of ['m04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10']) {
      expect(formatBRL(forMember(id).owed)).toBe('R$ 47,53');
    }
  });

  it('splits that share into one payment per collector', () => {
    const payments = forMember('m04').payments;
    expect(payments.map((payment) => [payment.name, formatBRL(payment.amount)])).toEqual([
      ['Membro 01', 'R$ 15,50'],
      ['Membro 02', 'R$ 15,88'],
      ['Clube', 'R$ 16,15'],
    ]);
    // Each payment carries the key the bill was collected to, so it can be acted on.
    expect(payments.map((payment) => payment.key)).toEqual([
      '41999000001',
      '41999000002',
      '41999000099',
    ]);
  });

  it('never asks a collector to pay themselves', () => {
    const m01 = forMember('m01');
    expect(m01.payments.map((payment) => payment.name)).toEqual(['Membro 02', 'Clube']);
    // Their own share of their own bill is already covered by what they fronted.
    expect(formatBRL(m01.owed)).toBe('R$ 32,03');
    expect(formatBRL(m01.receiving)).toBe('R$ 139,50');
  });

  it('pays gross, not netted: two collectors each pay the other', () => {
    const toM02 = forMember('m01').payments.find((payment) => payment.name === 'Membro 02');
    const toM01 = forMember('m02').payments.find((payment) => payment.name === 'Membro 01');
    expect(formatBRL(toM02!.amount)).toBe('R$ 15,88');
    expect(formatBRL(toM01!.amount)).toBe('R$ 15,50');
  });

  it('collects the club bill to the club, which holds no balance', () => {
    const club = settlement.collectors.find((entry) => entry.collector.kind === 'club');
    expect(club!.name).toBe('Clube');
    // All ten owe it: the club is not a member, so nobody's own share is excluded.
    expect(formatBRL(club!.collecting)).toBe('R$ 161,50');
    expect(formatBRL(club!.fronted)).toBe('R$ 161,47');
    expect(formatBRL(club!.rounding)).toBe('R$ 0,03');
    expect(settlement.members.some((member) => member.memberId === 'club')).toBe(false);
  });

  it('reports each position, receiving and owing kept apart', () => {
    // Receives 9 × 15,50 for the meat, and owes the dinner and the club's shopping.
    expect(formatBRL(forMember('m01').net)).toBe('R$ 107,47');
    // Receives 9 × 15,88 plus the 0,07 rounding, owes the meat and the shopping.
    expect(formatBRL(forMember('m02').net)).toBe('R$ 111,27');
    // Fronted nothing, so there is only one side to it.
    expect(formatBRL(forMember('m03').net)).toBe('-R$ 47,53');
  });

  it('gives the rounding to whoever collected the bill', () => {
    expect(formatBRL(settlement.rounding)).toBe('R$ 0,10');
    expect(formatBRL(forMember('m02').rounding)).toBe('R$ 0,07');
    // The meat divided evenly, so there was nothing to round.
    expect(forMember('m01').rounding).toBe(0);
  });

  it('shows every line to every member, including the ones they paid nothing for', () => {
    const lines = forMember('m04').lines;
    expect(lines.map((line) => line.description)).toEqual(['Carne', 'Mercado (janta)', 'Compras']);
    expect(lines.every((line) => !line.excluded)).toBe(true);
  });
});

describe('settle — invariants', () => {
  it('what the members are short is exactly what the club collects', () => {
    const club = settlement.collectors.find((entry) => entry.collector.kind === 'club');
    // Money leaving the members towards the club has no member credit to balance it: the club is
    // a key, not a row (D25).
    expect(sum(settlement.members.map((member) => member.net))).toBe(-club!.collecting);
  });

  it('every collector is owed exactly what the payers were asked for', () => {
    for (const collector of settlement.collectors) {
      const paid = sum(
        settlement.members.flatMap((member) =>
          member.payments
            .filter((payment) => payment.name === collector.name)
            .map((payment) => payment.amount),
        ),
      );
      expect(paid).toBe(collector.collecting);
    }
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
        collector: { kind: 'member', memberId: 'm01' },
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
          collector: { kind: 'member' as const, memberId: payers[random(payers.length)]!.id },
          amount: (1 + random(50_000)) as never,
          participants,
        })),
      };

      const result = settle(event, members);
      expect(sum(result.members.map((member) => member.net))).toBe(0);
      // Gross debts: everything a payer is asked for reaches a collector.
      const owed = sum(result.members.map((member) => member.owed));
      const collecting = sum(result.collectors.map((collector) => collector.collecting));
      expect(owed).toBe(collecting);
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
      expenses: [
        {
          ...acampamento.expenses[0]!,
          collector: { kind: 'member' as const, memberId: 'ninguem' },
        },
      ],
    };
    expect(() => settle(broken, members)).toThrow(/unknown payer/);
  });
});

describe('settle — the man who does not drink', () => {
  // The camping trip, plus the beer m03 had no part in. He pays two collectors of three.
  const withBeer: Event = {
    ...acampamento,
    expenses: [
      ...acampamento.expenses,
      {
        id: 'cerveja',
        description: 'Cerveja',
        collector: { kind: 'member', memberId: 'm02' },
        amount: 12_000 as never,
        participants: members.map((member) => ({
          memberId: member.id,
          weight: member.id === 'm03' ? 0 : 1,
        })),
      },
    ],
  };

  const settlement = settle(withBeer, members);
  const forMember = (id: string) => settlement.members.find((member) => member.memberId === id)!;

  it('charges him nothing for it, and says so on the line', () => {
    const beer = forMember('m03').lines.find((line) => line.expenseId === 'cerveja')!;
    expect(beer.amount).toBe(0);
    expect(beer.excluded).toBe(true);
  });

  it('leaves his total below everybody else by exactly the beer', () => {
    // 120,00 across the nine who drink is 13,34 each, rounded up.
    expect(formatBRL(forMember('m04').owed)).toBe('R$ 60,87');
    expect(formatBRL(forMember('m03').owed)).toBe('R$ 47,53');
  });

  it('still has him paying the collector for the bills he was in', () => {
    const toM02 = forMember('m03').payments.find((payment) => payment.name === 'Membro 02')!;
    // The dinner only: 15,88, with nothing added for the beer.
    expect(formatBRL(toM02.amount)).toBe('R$ 15,88');
  });

  it('collects the beer from the nine who drank it', () => {
    const m02 = settlement.collectors.find(
      (entry) => entry.collector.kind === 'member' && entry.collector.memberId === 'm02',
    )!;
    // Dinner 9 × 15,88 plus beer 8 × 13,34 — he is not charged for his own.
    expect(formatBRL(m02.collecting)).toBe('R$ 249,64');
  });
});

describe('settle — a guest', () => {
  // Somebody's friend came camping. He eats, he owes, and he holds nothing afterwards.
  const guest: Member = { id: 'g01', name: 'Amigo do Membro 02', guestOf: 'acampamento-2026-08' };
  const withGuest: Event = {
    ...acampamento,
    expenses: acampamento.expenses.map((expense) => ({
      ...expense,
      participants: [...expense.participants, { memberId: guest.id, weight: 1 }],
    })),
  };

  const settlement = settle(withGuest, [...members, guest]);
  const forMember = (id: string) => settlement.members.find((member) => member.memberId === id)!;

  it('charges him like anybody else', () => {
    // Eleven shares now, so everybody pays a little less than the ten-way split.
    expect(formatBRL(forMember('g01').owed)).toBe('R$ 43,21');
    expect(formatBRL(forMember('m04').owed)).toBe('R$ 43,21');
  });

  it('gives him no code, because codes are the club and he is not in it', () => {
    expect(forMember('g01').code).toBeUndefined();
    expect(forMember('m04').code).toBe(4);
  });

  it('routes his money to the collectors like everybody else', () => {
    expect(forMember('g01').payments.map((payment) => payment.name)).toEqual([
      'Membro 01',
      'Membro 02',
      'Clube',
    ]);
  });

  it('refuses a guest who holds a code', () => {
    const impostor: Member = { ...guest, code: 42 };
    expect(() => settle(withGuest, [...members, impostor])).toThrow(/cannot hold a code/);
  });

  it('refuses a member with no code who is not a guest', () => {
    const nameless: Member = { id: 'x01', name: 'Sem código' };
    expect(() => settle(acampamento, [...members, nameless])).toThrow(/has no identification code/);
  });
});
