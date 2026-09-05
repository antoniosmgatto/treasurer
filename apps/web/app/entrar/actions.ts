'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ActionResult } from '@/lib/action-result';
import { GATE_COOKIE, gateCookieOptions } from '@/lib/cookie';
import { t } from '@/lib/labels';
import { gateDigest, passphrase, sameSecret } from '@/lib/gate';

/** D34: one shared phrase, exchanged for a cookie that holds its digest and not the phrase. */
export async function unlock(_: ActionResult, form: FormData): Promise<ActionResult> {
  const secret = passphrase();
  // No gate configured, so there is nothing to answer — this is what a local `next dev` gets.
  if (!secret) redirect('/painel');

  if (!sameSecret(String(form.get('passphrase') ?? ''), secret)) return { error: t.gate.wrong };

  (await cookies()).set(GATE_COOKIE, gateDigest(secret), gateCookieOptions);
  redirect('/painel');
}
