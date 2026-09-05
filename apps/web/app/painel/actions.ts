'use server';

import {
  CLUB,
  parseBRL,
  participantsFor,
  settle,
  type Collector,
  type Expense,
} from '@treasurer/core';
import {
  addGuest,
  addMember,
  closeEvent,
  appendEntries,
  describeEvent,
  loadEvent,
  newId,
  openEvent,
  openEventFor,
  publishCharges,
  recomputeCharges,
  recordExpense,
  recordPayment,
  recordReimbursement,
  retireMember,
  setRoster,
  softDeleteExpense,
  updateExpense,
} from '@treasurer/db';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGroup } from '@/lib/session';

export async function createEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t.errors.required };

  const date = String(form.get('date') ?? '') || new Date().toISOString().slice(0, 10);
  await openEvent(await db(), { groupId, name, date });
  revalidatePath('/painel');
  return {};
}

/**
 * D31: while the event is open, what it is called and what it says about itself are both
 * correctable. The description is the part somebody reads before any bill exists.
 */
export async function describe(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGroup();
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t.errors.required };

  const date = String(form.get('date') ?? '').trim();
  if (!date) return { error: t.errors.required };

  const description = String(form.get('description') ?? '').trim();
  await describeEvent(await db(), String(form.get('eventId')), {
    name,
    date,
    description: description || null,
  });
  revalidatePath('/painel');
  return {};
}

/**
 * D31: a correction after the rateio was closed has to reach the ledger, or the panel goes on
 * showing the charge somebody already paid next to a bill that no longer says that. Before
 * publishing there is nothing recorded to correct, and appending here would publish twice.
 */
async function recompute(groupId: string, eventId: string): Promise<void> {
  const connection = await db();
  const event = await openEventFor(connection, groupId);
  if (event?.id !== eventId || !event.chargesPublishedAt) return;

  const loaded = await loadEvent(connection, eventId);
  if (!loaded) return;

  const settlement = settle(loaded.event, loaded.members);
  await recomputeCharges(connection, groupId, eventId, settlement.entries);
}

export async function saveRoster(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const eventId = String(form.get('eventId'));
  const memberIds = form.getAll('memberId').map(String);

  await setRoster(
    await db(),
    eventId,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  );
  // Somebody who was on the roster did not come, or turned up unannounced: every share moves.
  await recompute(groupId, eventId);
  revalidatePath('/painel');
  return {};
}

/**
 * D29: a guest is a name on one event. They are charged like anybody else and hold nothing —
 * no code, no place on the roster of the club, nothing that outlives the event.
 */
export async function addGuestToEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const eventId = String(form.get('eventId'));
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t.errors.required };

  const connection = await db();
  const guestId = await addGuest(connection, { groupId, eventId, name });

  // Somebody added on purpose is somebody who came: put them on the roster straight away.
  const loaded = await loadEvent(connection, eventId);
  const roster = loaded?.roster ?? [];
  await setRoster(connection, eventId, [...roster, { memberId: guestId, weight: 1 }]);

  // A guy turns up unannounced, after the rateio was closed. Everybody's share drops (D31).
  await recompute(groupId, eventId);
  revalidatePath('/painel');
  return {};
}

/**
 * Everything a bill is, read off a form. Adding one and correcting one ask for exactly the same
 * fields, so they read them the same way — an edit that validated differently from the original
 * would let a correction store something the form could never have created.
 */
async function readBill(
  form: FormData,
  eventId: string,
  id: string,
): Promise<{ expense: Expense } | { error: string }> {
  const description = String(form.get('description') ?? '').trim();
  const payerId = String(form.get('payerId') ?? '');
  if (!description || !payerId) return { error: t.errors.required };
  // 'club' is the reserved option in the picker: the club paid, and the club collects (D25).
  const collector: Collector = payerId === 'club' ? CLUB : { kind: 'member', memberId: payerId };
  const collectionKey = String(form.get('collectionKey') ?? '').trim();

  // D20: amounts are typed as text and parsed, never coerced by the browser.
  let amount;
  try {
    amount = parseBRL(String(form.get('amount') ?? ''));
  } catch {
    return { error: t.errors.badAmount };
  }
  if (amount <= 0) return { error: t.errors.badAmount };

  // Optional: the nota, when the buyer asked for less than it says (D28).
  const receiptRaw = String(form.get('receiptTotal') ?? '').trim();
  let receiptTotal;
  if (receiptRaw) {
    try {
      receiptTotal = parseBRL(receiptRaw);
    } catch {
      return { error: t.errors.badAmount };
    }
    if (receiptTotal <= 0) return { error: t.errors.badAmount };
  }

  /**
   * D12: participants are overrides. An untouched form ticks everybody, which is the same thing
   * as saying nothing, so it stores nothing and the roster answers for it later.
   *
   * The moment somebody is unticked the whole list is written down, the excluded member included
   * at weight 0 — D1 wants that line rendered rather than missing.
   */
  const loaded = await loadEvent(await db(), eventId);
  const participants = participantsFor(
    loaded?.roster ?? [],
    new Set(form.getAll('participant').map(String)),
  );

  return {
    expense: {
      id,
      description,
      collector,
      ...(collectionKey ? { collectionKey } : {}),
      amount,
      ...(receiptTotal ? { receiptTotal } : {}),
      participants,
    },
  };
}

export async function addExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const eventId = String(form.get('eventId'));

  const read = await readBill(form, eventId, newId());
  if ('error' in read) return read;

  await recordExpense(await db(), eventId, read.expense);
  await recompute(groupId, eventId);
  revalidatePath('/painel');
  return {};
}

/**
 * D31: while the event is open a bill can be fixed — the receipt was read wrong, the buyer
 * remembered the number late, somebody was on it who should not have been. Whoever already paid
 * against the old number is flagged for review rather than quietly left wrong.
 */
export async function editExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const eventId = String(form.get('eventId'));

  const read = await readBill(form, eventId, String(form.get('expenseId')));
  if ('error' in read) return read;

  const changed = await updateExpense(await db(), eventId, read.expense);
  if (!changed) return { error: t.errors.closed };

  await recompute(groupId, eventId);
  revalidatePath('/painel');
  return {};
}

export async function removeExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const eventId = String(form.get('eventId'));
  // D19: soft delete, and any ledger entries it produced are reversed rather than erased.
  await softDeleteExpense(await db(), groupId, String(form.get('expenseId')));
  await recompute(groupId, eventId);
  revalidatePath('/painel');
  return {};
}

/**
 * D15: closing the rateio is what makes amounts visible to members, and D3 is why it also writes
 * the ledger — from here on the charges are recorded facts, not a live calculation.
 */
export async function publish(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const eventId = String(form.get('eventId'));
  const connection = await db();

  const loaded = await loadEvent(connection, eventId);
  if (!loaded) return { error: t.errors.noAccess };

  const settlement = settle(loaded.event, loaded.members);
  await appendEntries(connection, groupId, settlement.entries);
  await publishCharges(connection, eventId);
  revalidatePath('/painel');
  return {};
}

/**
 * Closing is what lets the next rolê exist: the database allows one open event per group (D4),
 * so an event that can never be closed is a club with exactly one event, forever.
 *
 * It closes at any time. Whatever is still open stays open in the record rather than blocking
 * the group from moving on — some people pay late, and one of them should not hold the club.
 */
export async function settleEvent(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGroup();
  await closeEvent(await db(), String(form.get('eventId')));
  revalidatePath('/painel');
  return {};
}

export async function markPaid(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const connection = await db();
  const eventId = String(form.get('eventId'));

  let amount;
  try {
    amount = parseBRL(String(form.get('amount') ?? ''));
  } catch {
    return { error: t.errors.badAmount };
  }

  await recordPayment(connection, groupId, {
    memberId: String(form.get('memberId')),
    eventId,
    amount,
  });
  revalidatePath('/painel');
  return {};
}

/** D13 again, in the direction that closes the event: the caixa paying a fronter back. */
export async function markReimbursed(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const connection = await db();

  let amount;
  try {
    amount = parseBRL(String(form.get('amount') ?? ''));
  } catch {
    return { error: t.errors.badAmount };
  }

  await recordReimbursement(connection, groupId, {
    memberId: String(form.get('memberId')),
    eventId: String(form.get('eventId')),
    amount,
  });
  revalidatePath('/painel');
  return {};
}

export async function createMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t.errors.required };

  await addMember(await db(), groupId, name);
  revalidatePath('/painel/membros');
  return {};
}

export async function retire(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGroup();
  // D19: never deleted. They stay on the events they took part in, and their code stays spent.
  await retireMember(await db(), String(form.get('memberId')));
  revalidatePath('/painel/membros');
  return {};
}

export async function ensureOpenEvent(groupId: string): Promise<string | null> {
  const existing = await openEventFor(await db(), groupId);
  return existing?.id ?? null;
}
