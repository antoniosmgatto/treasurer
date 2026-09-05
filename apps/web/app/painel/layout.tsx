import { groupById } from '@treasurer/db';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { GROUP_COOKIE } from '@/lib/cookie';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { leaveClub } from './clubes/actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The panel's chrome. Three pages used to hand-roll a header each, and D35 gives them a fourth
 * thing they all have to say: which clube you are in, now that it can be more than one.
 *
 * **Not a boundary.** The App Router does not re-render a layout when you navigate between its
 * pages, so a check here holds on a hard load and leaks on a soft one. The gate lives in
 * `requireGroup` for exactly that reason (D34); this reads the cookie only to write a name on the
 * screen, and every page below still answers for itself.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const groupId = (await cookies()).get(GROUP_COOKIE)?.value;
  const club = groupId ? await groupById(await db(), groupId) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <nav className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-5 py-3 text-xs">
        <Link href="/painel" className="underline-offset-4 hover:underline">
          {t.event.expenses}
        </Link>
        <Link href="/painel/membros" className="underline-offset-4 hover:underline">
          {t.event.members}
        </Link>
        <Link href="/painel/clubes" className="underline-offset-4 hover:underline">
          {club ? club.name : t.club.title}
        </Link>
        {club && (
          <form action={leaveClub} className="ml-auto">
            <SubmitButton variant="ghost" size="sm">
              {t.club.leave}
            </SubmitButton>
          </form>
        )}
      </nav>
      {children}
    </div>
  );
}
