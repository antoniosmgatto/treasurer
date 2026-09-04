import { cents } from '../src/money.js';
import type { Event, Member, Participant } from '../src/types.js';

/**
 * The reference event: a three-night camping trip, ten people sharing, three of whom fronted
 * money — one of them the caixa itself. Anonymized; the amounts are what matter.
 */
export const TREASURY_ID = 'caixa';

export const members: Member[] = [
  { id: 'caixa', name: 'Caixa do Clube', code: 99, isTreasury: true },
  { id: 'm01', name: 'Membro 01', code: 1, isTreasury: false },
  { id: 'm02', name: 'Membro 02', code: 2, isTreasury: false },
  { id: 'm03', name: 'Membro 03', code: 3, isTreasury: false },
  { id: 'm04', name: 'Membro 04', code: 4, isTreasury: false },
  { id: 'm05', name: 'Membro 05', code: 5, isTreasury: false },
  { id: 'm06', name: 'Membro 06', code: 6, isTreasury: false },
  { id: 'm07', name: 'Membro 07', code: 7, isTreasury: false },
  { id: 'm08', name: 'Membro 08', code: 8, isTreasury: false },
  { id: 'm09', name: 'Membro 09', code: 9, isTreasury: false },
  { id: 'm10', name: 'Membro 10', code: 10, isTreasury: false },
];

/** Everyone rides, nobody is excluded, and the caixa never carries a share. */
const everyone: Participant[] = members
  .filter((member) => !member.isTreasury)
  .map((member) => ({ memberId: member.id, weight: 1 }));

export const acampamento: Event = {
  id: 'acampamento-2026-08',
  name: 'Acampamento',
  date: '2026-08-28',
  status: 'open',
  expenses: [
    {
      id: 'carne',
      description: 'Carne',
      payerId: 'm01',
      amount: cents(15_500),
      participants: everyone,
    },
    {
      id: 'mercado',
      description: 'Mercado (janta)',
      payerId: 'm02',
      amount: cents(15_873),
      participants: everyone,
    },
    {
      id: 'compras',
      description: 'Compras',
      payerId: TREASURY_ID,
      amount: cents(16_147),
      participants: everyone,
    },
  ],
};
