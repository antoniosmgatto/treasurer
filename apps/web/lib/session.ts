import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROUP_COOKIE } from './cookie';

/** The group the current treasurer may write to, or a redirect to the door. */
export async function requireGroup(): Promise<string> {
  const groupId = (await cookies()).get(GROUP_COOKIE)?.value;
  if (!groupId) redirect('/');
  return groupId;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(GROUP_COOKIE);
}
