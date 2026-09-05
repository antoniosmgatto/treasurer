import { CLUB, chatSummary, settle, type Member } from '@treasurer/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { newToken } from '../src/ids.js';
import {
  addGuest,
  appendEntries,
  balancesFor,
  closeEvent,
  insertMembers,
  linksFor,
  loadEvent,
  membersOf,
  nextCode,
  recordExpense,
  type Db,
} from '../src/repository.js';
import { events, groups } from '../src/schema.js';
import { freshDatabase } from './harness.js';

const GROUP = 'moto-clube';
const EVENT = 'acampamento';

const roster: Member[] = Array.from({ length: 10 }, (_, index) => ({
  id: `m${String(index + 1).padStart(2, '0')}`,
  name: `Membro ${String(index + 1).padStart(2, '0')}`,
  code: index + 1,
}));

const everyone = roster.map((member) => ({ memberId: member.id, weight: 1 }));

let db: Db;

async function seed(): Promise<void> {
  await db.insert(groups).values({
    id: GROUP,
    name: 'Moto Clube',
    writeToken: newToken(),
    readToken: newToken(),
  });
  await insertMembers(db, GROUP, roster);
  await db.insert(events).values({
    id: EVENT,
    groupId: GROUP,
    name: 'Acampamento',
    date: '2026-08-28',
  });
}

beforeEach(async () => {
  db = await freshDatabase();
  await seed();
});

describe('round trip', () => {
  it('returns the engine the same objects a JSON file would', async () => {
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 15_500 as never,
      participants: everyone,
    });
    await recordExpense(db, EVENT, {
      id: 'mercado',
      description: 'Mercado (janta)',
      collector: { kind: 'member', memberId: 'm02' },
      amount: 15_873 as never,
      participants: everyone,
    });
    await recordExpense(db, EVENT, {
      id: 'compras',
      description: 'Compras',
      collector: { kind: 'member', memberId: 'm03' },
      amount: 16_147 as never,
      participants: everyone,
    });

    const loaded = await loadEvent(db, EVENT);
    expect(loaded).not.toBeNull();

    const settlement = settle(loaded!.event, loaded!.members);
    const forMember = (id: string) => settlement.members.find((m) => m.memberId === id)!;

    // The same numbers the engine produces from the JSON fixture.
    expect(settlement.total).toBe(47_520);
    expect(forMember('m01').net).toBe(10_747);
    expect(forMember('m02').net).toBe(11_127);
    expect(forMember('m03').net).toBe(11_397);
    expect(forMember('m04').owed).toBe(4753);
    expect(settlement.rounding).toBe(10);
    expect(chatSummary(loaded!.event, settlement)).toContain('• Membro 04: R$ 47,53');
  });

  it('returns null for an event that does not exist', async () => {
    expect(await loadEvent(db, 'nope')).toBeNull();
  });

  it('preserves weights, including exclusions', async () => {
    await recordExpense(db, EVENT, {
      id: 'cerveja',
      description: 'Cerveja',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 6000 as never,
      participants: [
        { memberId: 'm01', weight: 1 },
        { memberId: 'm02', weight: 2 },
        { memberId: 'm03', weight: 0 },
      ],
    });

    const loaded = await loadEvent(db, EVENT);
    const participants = [...loaded!.event.expenses[0]!.participants].sort((a, b) =>
      a.memberId.localeCompare(b.memberId),
    );
    expect(participants).toEqual([
      { memberId: 'm01', weight: 1 },
      { memberId: 'm02', weight: 2 },
      { memberId: 'm03', weight: 0 },
    ]);
  });
});

/**
 * Drizzle reports the failed statement as the message and hangs the Postgres detail off `cause`,
 * so assert on the constraint the database actually rejected with.
 */
async function violation(write: () => Promise<unknown>): Promise<string> {
  try {
    await write();
  } catch (error) {
    return JSON.stringify((error as { cause?: unknown }).cause ?? error);
  }
  throw new Error('Expected the database to reject this write, and it did not');
}

describe('the database enforces the decisions, not just the code', () => {
  it('refuses a second open event in the same group (D4)', async () => {
    const detail = await violation(() =>
      db.insert(events).values({
        id: 'churrasco',
        groupId: GROUP,
        name: 'Churrasco',
        date: '2026-09-12',
      }),
    );
    expect(detail).toContain('event_one_open_per_group_idx');
  });

  it('allows a new event once the previous one is settled', async () => {
    await closeEvent(db, EVENT);
    await expect(
      db.insert(events).values({
        id: 'churrasco',
        groupId: GROUP,
        name: 'Churrasco',
        date: '2026-09-12',
      }),
    ).resolves.not.toThrow();
  });

  it('keeps a guest on their event and out of the club', async () => {
    const guestId = await addGuest(db, { groupId: GROUP, eventId: EVENT, name: 'Amigo' });

    // Not on the roster of the club, and holding no link.
    const club = await membersOf(db, GROUP);
    expect(club.some((member) => member.id === guestId)).toBe(false);
    const links = await linksFor(db, GROUP);
    expect(links?.links.some((link) => link.name === 'Amigo')).toBe(false);

    // Present on the event they came to, with no code.
    const loaded = await loadEvent(db, EVENT);
    const guest = loaded!.members.find((member) => member.id === guestId)!;
    expect(guest.name).toBe('Amigo');
    expect(guest.code).toBeUndefined();
    expect(guest.guestOf).toBe(EVENT);
  });

  it('does not spend an identification code on a guest (D7)', async () => {
    const before = await nextCode(db, GROUP);
    await addGuest(db, { groupId: GROUP, eventId: EVENT, name: 'Outro amigo' });
    expect(await nextCode(db, GROUP)).toBe(before);
  });

  it('round-trips a nota that differs from what was charged', async () => {
    await recordExpense(db, EVENT, {
      id: 'carne-arredondada',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 15_500 as never,
      receiptTotal: 16_147 as never,
      participants: everyone,
    });

    const loaded = await loadEvent(db, EVENT);
    const stored = loaded!.event.expenses.find((expense) => expense.id === 'carne-arredondada')!;
    expect(stored.amount).toBe(15_500);
    expect(stored.receiptTotal).toBe(16_147);

    // Only the charged amount is split.
    const settlement = settle(loaded!.event, loaded!.members);
    const line = settlement.members
      .find((member) => member.memberId === 'm04')!
      .lines.find((entry) => entry.expenseId === 'carne-arredondada')!;
    expect(line.amount).toBe(1550);
  });

  it('round-trips a bill the club paid for, which has no payer row', async () => {
    await recordExpense(db, EVENT, {
      id: 'compras-clube',
      description: 'Compras do clube',
      collector: CLUB,
      collectionKey: '41999000099',
      amount: 16_147 as never,
      participants: everyone,
    });

    const loaded = await loadEvent(db, EVENT);
    const stored = loaded!.event.expenses.find((expense) => expense.id === 'compras-clube')!;
    expect(stored.collector).toEqual({ kind: 'club' });
    expect(stored.collectionKey).toBe('41999000099');

    // All ten owe the club: it is not a member, so nobody's own share is excluded.
    const settlement = settle(loaded!.event, loaded!.members);
    const club = settlement.collectors.find((entry) => entry.collector.kind === 'club')!;
    expect(club.collecting).toBe(16_150);
    expect(settlement.members.some((member) => member.memberId === 'club')).toBe(false);
  });

  it('refuses two members sharing an identification code', async () => {
    const detail = await violation(() =>
      insertMembers(db, GROUP, [{ id: 'm11', name: 'Membro 11', code: 1 }]),
    );
    expect(detail).toContain('member_group_code_idx');
  });
});

describe('identification codes are never reissued (D7)', () => {
  it('skips codes held by members who have left', async () => {
    expect(await nextCode(db, GROUP)).toBe(11);

    await insertMembers(db, GROUP, [
      { id: 'm11', name: 'Membro 11', code: 11, retiredAt: '2026-01-01' },
    ]);

    expect(await nextCode(db, GROUP)).toBe(12);
  });
});

describe('the ledger', () => {
  it('folds appended entries into balances', async () => {
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 15_500 as never,
      participants: everyone,
    });

    const loaded = await loadEvent(db, EVENT);
    const settlement = settle(loaded!.event, loaded!.members);
    await appendEntries(db, GROUP, settlement.entries);

    const balances = await balancesFor(db, GROUP);
    expect(balances.get('m01')).toBe(13_950); // 155,00 fronted less their own 15,50
    expect(balances.get('m05')).toBe(-1550);

    const total = [...balances.values()].reduce((sum, value) => sum + value, 0);
    expect(total).toBe(0);
  });

  it('accumulates rather than replacing, because entries are only appended', async () => {
    await appendEntries(db, GROUP, [
      { memberId: 'm01', kind: 'payment', amount: 4803 as never },
      { memberId: 'm01', kind: 'adjustment', amount: -3 as never, note: 'ajuste' },
    ]);

    expect((await balancesFor(db, GROUP)).get('m01')).toBe(4800);
  });
});
