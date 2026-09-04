import { settle } from '@treasurer/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { newToken } from '../src/ids.js';
import {
  appendEntries,
  balancesFor,
  insertMembers,
  loadEvent,
  memberByReadToken,
  openEventFor,
  publishCharges,
  recordExpense,
  recordPayment,
  retireMember,
  setRoster,
  softDeleteExpense,
  type Db,
} from '../src/repository.js';
import { events, groups, members } from '../src/schema.js';
import { freshDatabase } from './harness.js';

const GROUP = 'clube';
const EVENT = 'churrasco';

let db: Db;

beforeEach(async () => {
  db = await freshDatabase();
  await db
    .insert(groups)
    .values({ id: GROUP, name: 'Clube', writeToken: newToken(), readToken: newToken() });
  await insertMembers(db, GROUP, [
    { id: 'caixa', name: 'Caixa', code: 99, isTreasury: true },
    { id: 'm01', name: 'Membro 01', code: 1, isTreasury: false },
    { id: 'm02', name: 'Membro 02', code: 2, isTreasury: false },
    { id: 'm03', name: 'Membro 03', code: 3, isTreasury: false },
  ]);
  await db
    .insert(events)
    .values({ id: EVENT, groupId: GROUP, name: 'Churrasco', date: '2026-09-12' });
});

describe('the event roster (D12)', () => {
  const roster = [
    { memberId: 'm01', weight: 1 },
    { memberId: 'm02', weight: 1 },
    { memberId: 'm03', weight: 1 },
  ];

  it('is the default participant set for an expense', async () => {
    await setRoster(db, EVENT, roster);
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      payerId: 'm01',
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    expect(loaded!.event.expenses[0]!.participants).toHaveLength(3);

    const settlement = settle(loaded!.event, loaded!.members);
    expect(settlement.members.find((m) => m.memberId === 'm02')!.owed).toBe(3000);
  });

  it('is overridden by an expense that names its own participants', async () => {
    await setRoster(db, EVENT, roster);
    await recordExpense(db, EVENT, {
      id: 'cerveja',
      description: 'Cerveja',
      payerId: 'm01',
      amount: 6000 as never,
      participants: [
        { memberId: 'm01', weight: 1 },
        { memberId: 'm02', weight: 1 },
        { memberId: 'm03', weight: 0 },
      ],
    });

    const loaded = await loadEvent(db, EVENT);
    const settlement = settle(loaded!.event, loaded!.members);
    expect(settlement.members.find((m) => m.memberId === 'm03')!.owed).toBe(0);
  });

  it('is replaced wholesale rather than accumulated', async () => {
    await setRoster(db, EVENT, roster);
    await setRoster(db, EVENT, [{ memberId: 'm01', weight: 1 }]);

    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      payerId: 'm01',
      amount: 9000 as never,
      participants: [],
    });
    const loaded = await loadEvent(db, EVENT);
    expect(loaded!.event.expenses[0]!.participants).toEqual([{ memberId: 'm01', weight: 1 }]);
  });
});

describe('member read links (D11)', () => {
  it('resolves a member from their own token', async () => {
    const [row] = await db.select().from(members).where(eq(members.id, 'm02'));
    const found = await memberByReadToken(db, row!.readToken);
    expect(found?.member.name).toBe('Membro 02');
    expect(found?.groupId).toBe(GROUP);
  });

  it('gives every member a distinct token', async () => {
    const rows = await db.select().from(members);
    expect(new Set(rows.map((row) => row.readToken)).size).toBe(rows.length);
  });

  it('returns null for an unknown token', async () => {
    expect(await memberByReadToken(db, 'not-a-token')).toBeNull();
  });
});

describe('publishing charges (D15)', () => {
  it('starts unpublished and can be published once the treasurer is done', async () => {
    const before = await openEventFor(db, GROUP);
    expect(before?.chargesPublishedAt).toBeNull();

    await publishCharges(db, EVENT);
    const after = await openEventFor(db, GROUP);
    expect(after?.chargesPublishedAt).toBeInstanceOf(Date);
  });
});

describe('soft delete (D19)', () => {
  it('hides a deleted expense but reverses its ledger entries rather than erasing them', async () => {
    await setRoster(db, EVENT, [
      { memberId: 'm01', weight: 1 },
      { memberId: 'm02', weight: 1 },
    ]);
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      payerId: 'm01',
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    await appendEntries(db, GROUP, settle(loaded!.event, loaded!.members).entries);
    expect((await balancesFor(db, GROUP)).get('m02')).toBe(-4500);

    await softDeleteExpense(db, GROUP, 'carne');

    const after = await loadEvent(db, EVENT);
    expect(after!.event.expenses).toHaveLength(0);
    // Balance is back to zero, and it got there by adding entries, not removing them.
    expect((await balancesFor(db, GROUP)).get('m02')).toBe(0);
  });

  it('keeps a retired member visible, because they were on past events (D7)', async () => {
    await retireMember(db, 'm03');
    const loaded = await loadEvent(db, EVENT);
    expect(loaded!.members.map((member) => member.id)).toContain('m03');
    expect(loaded!.members.find((member) => member.id === 'm03')!.retiredAt).toBeDefined();
  });
});

describe('recording a payment (D13)', () => {
  it('appends a payment that moves the member towards quitado', async () => {
    await setRoster(db, EVENT, [
      { memberId: 'm01', weight: 1 },
      { memberId: 'm02', weight: 1 },
    ]);
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      payerId: 'm01',
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    const settlement = settle(loaded!.event, loaded!.members);
    await appendEntries(db, GROUP, settlement.entries);

    const charged = settlement.members.find((m) => m.memberId === 'm02')!.charged!;
    await recordPayment(db, GROUP, { memberId: 'm02', eventId: EVENT, amount: charged });

    // Owed 45,00 exactly, so the charge is 45,02: the cents are the code, never the amount (D1).
    expect(charged).toBe(4502);
    expect((await balancesFor(db, GROUP)).get('m02')).toBe(2);
  });
});
