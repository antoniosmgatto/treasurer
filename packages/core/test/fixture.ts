import { cents } from '../src/money.js';
import { CLUB, type Event, type Member, type Participant } from '../src/types.js';

/**
 * The reference event: a three-night camping trip, ten people sharing. Two members fronted a bill
 * each and collect it to their own key; the third was paid for by the club and is collected to
 * the club's. Anonymized; the amounts are what matter.
 */
export const members: Member[] = [
  { id: 'm01', name: 'Membro 01', code: 1 },
  { id: 'm02', name: 'Membro 02', code: 2 },
  { id: 'm03', name: 'Membro 03', code: 3 },
  { id: 'm04', name: 'Membro 04', code: 4 },
  { id: 'm05', name: 'Membro 05', code: 5 },
  { id: 'm06', name: 'Membro 06', code: 6 },
  { id: 'm07', name: 'Membro 07', code: 7 },
  { id: 'm08', name: 'Membro 08', code: 8 },
  { id: 'm09', name: 'Membro 09', code: 9 },
  { id: 'm10', name: 'Membro 10', code: 10 },
];

/** Everyone rides and nobody is excluded. */
const everyone: Participant[] = members.map((member) => ({ memberId: member.id, weight: 1 }));

export const acampamento: Event = {
  id: 'acampamento-2026-08',
  name: 'Acampamento',
  date: '2026-08-28',
  status: 'open',
  expenses: [
    {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      collectionKey: '41999000001',
      amount: cents(15_500),
      participants: everyone,
    },
    {
      id: 'mercado',
      description: 'Mercado (janta)',
      collector: { kind: 'member', memberId: 'm02' },
      collectionKey: '41999000002',
      amount: cents(15_873),
      participants: everyone,
    },
    {
      id: 'compras',
      description: 'Compras',
      collector: CLUB,
      collectionKey: '41999000099',
      amount: cents(16_147),
      participants: everyone,
    },
  ],
};
