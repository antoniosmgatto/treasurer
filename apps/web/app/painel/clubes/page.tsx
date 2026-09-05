import { allGroups, linksFor } from '@treasurer/db';
import { cookies } from 'next/headers';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GROUP_COOKIE } from '@/lib/cookie';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGate } from '@/lib/session';
import { createClub, switchClub } from './actions';

/**
 * Mandatory rather than decorative: with no passphrase set, `requireGate` returns without reading
 * a cookie, so nothing would mark this route dynamic and Next would prerender it at build — where
 * `DATABASE_URL` exists, baking a stale list of clubes into a static page instead of failing.
 */
export const dynamic = 'force-dynamic';

/**
 * D35: the clube to work on, picked from a list. It cannot call `requireGroup` — there may be no
 * clube yet, and this is the screen that fixes that — so it answers to the gate directly.
 */
export default async function ClubesPage() {
  await requireGate();
  const connection = await db();

  const clubs = await allGroups(connection);
  const currentId = (await cookies()).get(GROUP_COOKIE)?.value;
  const current = clubs.find((club) => club.id === currentId);
  // D14 again: the write link is shown on a page somebody asked for, never in an address bar.
  const links = current ? await linksFor(connection, current.id) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t.club.title}</h1>

      {clubs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.club.none}</p>
      ) : (
        <section className="flex flex-col gap-2">
          {clubs.map((club) => (
            <ActionForm
              key={club.id}
              action={switchClub}
              className="flex items-center justify-between gap-4 border-b pb-2"
            >
              <input type="hidden" name="groupId" value={club.id} />
              <span className="text-sm">
                {club.name}
                {club.id === currentId && (
                  <span className="text-muted-foreground text-xs"> · {t.club.current}</span>
                )}
              </span>
              {club.id !== currentId && (
                <SubmitButton variant="secondary" size="sm">
                  {t.club.use}
                </SubmitButton>
              )}
            </ActionForm>
          ))}
        </section>
      )}

      {links && (
        <details className="flex flex-col gap-2">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t.club.treasurerLink}
          </summary>
          <p className="mt-2 font-mono text-sm break-all">/acesso/{links.writeToken}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t.club.treasurerLinkHint}</p>
        </details>
      )}

      <ActionForm action={createClub} className="flex flex-col gap-3 border-t pt-4">
        <h2 className="font-medium">{t.club.new}</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="clubName">{t.club.name}</Label>
          <Input id="clubName" name="name" placeholder="Clube de teste" required />
          <p className="text-muted-foreground text-xs">{t.club.newHint}</p>
        </div>
        <div>
          <SubmitButton>{t.club.create}</SubmitButton>
        </div>
      </ActionForm>
    </main>
  );
}
