'use server';

import { CLUB, parseBRL, participantsFor, settle, type Collector } from '@treasurer/core';
import {
  addMember,
  appendEntries,
  loadEvent,
  newId,
  openEvent,
  openEventFor,
  publishCharges,
  recordExpense,
  recordPayment,
  recordReimbursement,
  retireMember,
  setRoster,
  softDeleteExpense,
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

export async function saveRoster(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGroup();
  const eventId = String(form.get('eventId'));
  const memberIds = form.getAll('memberId').map(String);

  await setRoster(
    await db(),
    eventId,
    memberIds.map((memberId) => ({ memberId, weight: 1 })),
  );
  revalidatePath('/painel');
  return {};
}

export async function addExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGroup();
  const eventId = String(form.get('eventId'));
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

  await recordExpense(await db(), eventId, {
    id: newId(),
    description,
    collector,
    ...(collectionKey ? { collectionKey } : {}),
    amount,
    ...(receiptTotal ? { receiptTotal } : {}),
    participants,
  });
  revalidatePath('/painel');
  return {};
}

export async function removeExpense(_: ActionResult, form: FormData): Promise<ActionResult> {
  const groupId = await requireGroup();
  // D19: soft delete, and any ledger entries it produced are reversed rather than erased.
  await softDeleteExpense(await db(), groupId, String(form.get('expenseId')));
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
