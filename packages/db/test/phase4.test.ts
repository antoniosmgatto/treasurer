import { settle } from '@treasurer/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { newToken } from '../src/ids.js';
import {
  allGroups,
  appendEntries,
  balancesFor,
  groupByWriteToken,
  insertMembers,
  linksFor,
  loadEvent,
  memberByReadToken,
  openEventFor,
  publishCharges,
  recordExpense,
  recordPayment,
  recordReimbursement,
  retireMember,
  rotateWriteToken,
  setRoster,
  softDeleteExpense,
  type Db,
} from '../src/repository.js';
import { events, groups, ledgerEntries, members } from '../src/schema.js';
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
    { id: 'm01', name: 'Membro 01', code: 1 },
    { id: 'm02', name: 'Membro 02', code: 2 },
    { id: 'm03', name: 'Membro 03', code: 3 },
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
      collector: { kind: 'member', memberId: 'm01' },
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
      collector: { kind: 'member', memberId: 'm01' },
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
      collector: { kind: 'member', memberId: 'm01' },
      amount: 9000 as never,
      participants: [],
    });
    const loaded = await loadEvent(db, EVENT);
    expect(loaded!.event.expenses[0]!.participants).toEqual([{ memberId: 'm01', weight: 1 }]);
  });
});

describe('an event with no roster saved', () => {
  it('splits across everyone rather than settling to zero', async () => {
    // Exactly what a treasurer does when the checkboxes already look right: never press save,
    // add the expenses, publish.
    await recordExpense(db, EVENT, {
      id: 'beras',
      description: 'Beras',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 15099 as never,
      participants: [],
    });
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm02' },
      amount: 5000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    const settlement = settle(loaded!.event, loaded!.members);

    // Three members, R$200,99. Previously every payer netted zero and the rest never appeared.
    expect(settlement.members).toHaveLength(3);
    expect(settlement.total).toBe(20099);
    // 200,99 three ways is 66,996 each, rounded up so the three shares cover the bill.
    expect(settlement.members.find((m) => m.memberId === 'm03')!.owed).toBe(6700);
    expect(settlement.rounding).toBe(1);

    expect(settlement.members.reduce((total, m) => total + m.net, 0)).toBe(0);
  });

  it('leaves an explicitly saved roster alone', async () => {
    await setRoster(db, EVENT, [{ memberId: 'm01', weight: 1 }]);
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    expect(loaded!.event.expenses[0]!.participants).toEqual([{ memberId: 'm01', weight: 1 }]);
  });

  it('excludes a retired member from the implied roster (D7)', async () => {
    await retireMember(db, 'm03');
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    const ids = loaded!.event.expenses[0]!.participants.map((p) => p.memberId);
    expect(ids).toEqual(['m01', 'm02']);
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
      collector: { kind: 'member', memberId: 'm01' },
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
      collector: { kind: 'member', memberId: 'm01' },
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    const settlement = settle(loaded!.event, loaded!.members);
    await appendEntries(db, GROUP, settlement.entries);

    const owed = settlement.members.find((m) => m.memberId === 'm02')!.owed;
    await recordPayment(db, GROUP, { memberId: 'm02', eventId: EVENT, amount: owed });

    // Owed 45,00 exactly, and that is what is asked for: no code lives in the amount.
    expect(owed).toBe(4500);
    expect((await balancesFor(db, GROUP)).get('m02')).toBe(0);
  });
});

describe('reimbursing whoever fronted the money', () => {
  it('closes the event out to zero once the fronter has been paid back', async () => {
    await setRoster(db, EVENT, [
      { memberId: 'm01', weight: 1 },
      { memberId: 'm02', weight: 1 },
    ]);
    await recordExpense(db, EVENT, {
      id: 'carne',
      description: 'Carne',
      collector: { kind: 'member', memberId: 'm01' },
      amount: 9000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    const settlement = settle(loaded!.event, loaded!.members);
    await appendEntries(db, GROUP, settlement.entries);

    // m01 fronted 90,00 and consumed 45,00 of it, so the other half comes back to them.
    const fronter = settlement.members.find((m) => m.memberId === 'm01')!;
    expect(fronter.owed).toBe(0);
    expect(fronter.net).toBe(4500);
    expect((await balancesFor(db, GROUP)).get('m01')).toBe(4500);

    await recordReimbursement(db, GROUP, {
      memberId: 'm01',
      eventId: EVENT,
      amount: fronter.net,
    });

    // Paid back, so the group owes them nothing. Without this the fronter stays a creditor
    // forever and the event can never reach quitado.
    expect((await balancesFor(db, GROUP)).get('m01')).toBe(0);
  });

  it('records the payout as its own entry rather than editing the credit (D3)', async () => {
    await setRoster(db, EVENT, [{ memberId: 'm01', weight: 1 }]);
    await recordExpense(db, EVENT, {
      id: 'mercado',
      description: 'Mercado',
      collector: { kind: 'member', memberId: 'm02' },
      amount: 5000 as never,
      participants: [],
    });

    const loaded = await loadEvent(db, EVENT);
    await appendEntries(db, GROUP, settle(loaded!.event, loaded!.members).entries);
    await recordReimbursement(db, GROUP, {
      memberId: 'm02',
      eventId: EVENT,
      amount: 5000 as never,
    });

    const kinds = (
      await db.select().from(ledgerEntries).where(eq(ledgerEntries.memberId, 'm02'))
    ).map((entry) => entry.kind);
    expect(kinds).toContain('reimbursement');
    expect(kinds).toContain('front');
  });
});

describe('reissuing the links', () => {
  it('reprints what seed printed once', async () => {
    const [only] = await allGroups(db);
    const found = await linksFor(db, only!.id);

    expect(found?.links.map((link) => link.name)).toEqual(['Membro 01', 'Membro 02', 'Membro 03']);
    expect(found?.writeToken).toHaveLength(22);
  });

  it('rotates the write token so a leaked link stops working', async () => {
    const before = (await linksFor(db, GROUP))!.writeToken;
    expect(await groupByWriteToken(db, before)).toBe(GROUP);

    const after = await rotateWriteToken(db, GROUP);

    expect(after).not.toBe(before);
    // The point of rotating: the old URL is now worthless to whoever has it.
    expect(await groupByWriteToken(db, before!)).toBeNull();
    expect(await groupByWriteToken(db, after!)).toBe(GROUP);
  });

  it('returns null for a group that does not exist', async () => {
    expect(await linksFor(db, 'no-such-group')).toBeNull();
    expect(await rotateWriteToken(db, 'no-such-group')).toBeNull();
  });
});
