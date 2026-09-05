'use server';

import { allGroups, createGroup } from '@treasurer/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ActionResult } from '@/lib/action-result';
import { GROUP_COOKIE, groupCookieOptions } from '@/lib/cookie';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGate, signOut } from '@/lib/session';

/**
 * D35: the clube to work on is picked from a list rather than proven by holding its write link.
 *
 * The id arrives in a hidden field, and a hidden field is whatever the sender typed — so this
 * checks it names a clube at all before writing it into a cookie that `requireGroup` reads back
 * as authorisation. What stands in front of the whole screen is the passphrase (D34).
 */
export async function switchClub(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGate();
  const groupId = String(form.get('groupId'));

  const known = await allGroups(await db());
  if (!known.some((group) => group.id === groupId)) return { error: t.club.unknown };

  (await cookies()).set(GROUP_COOKIE, groupId, groupCookieOptions);
  redirect('/painel');
}

/**
 * D18 said the first clube has to come from the CLI, because reaching the admin page needed a
 * token the CLI issues. The passphrase retired that: the panel is reachable before any clube
 * exists, so it can make one — which is what trying the app on a throwaway roster needs, without
 * touching the real one.
 */
export async function createClub(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireGate();
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: t.errors.required };

  // No roster: `createGroup` takes the members the CLI reads out of a JSON file, and a form has
  // none. They are added one at a time next door, where `addMember` assigns the codes.
  const created = await createGroup(await db(), { name, members: [] });
  (await cookies()).set(GROUP_COOKIE, created.groupId, groupCookieOptions);

  // Straight to the roster: a clube with nobody in it settles every rolê to zero.
  redirect('/painel/membros');
}

/** The call site `signOut` never had — a picker is only useful if you can put a clube down. */
export async function leaveClub(): Promise<void> {
  await requireGate();
  await signOut();
  redirect('/painel/clubes');
}
