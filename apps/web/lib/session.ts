import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GATE_COOKIE, GROUP_COOKIE } from './cookie';
import { holdsGate, passphrase } from './gate';

/** Whether this browser is past the gate. True everywhere no gate exists (D34). */
export async function pastGate(): Promise<boolean> {
  const secret = passphrase();
  if (!secret) return true;
  return holdsGate((await cookies()).get(GATE_COOKIE)?.value, secret);
}

export async function requireGate(): Promise<void> {
  if (!(await pastGate())) redirect('/entrar');
}

/**
 * The group the current treasurer may write to, or a redirect to the door.
 *
 * D34: the gate is checked here rather than in a proxy in front of the router. Every panel page
 * and every server action already calls this, so covering it covers them by construction — where
 * a route matcher would rest on an invariant nothing enforces, that a server action always posts
 * to a URL under `/painel`.
 */
export async function requireGroup(): Promise<string> {
  await requireGate();
  const groupId = (await cookies()).get(GROUP_COOKIE)?.value;
  if (!groupId) redirect('/');
  return groupId;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(GROUP_COOKIE);
}
