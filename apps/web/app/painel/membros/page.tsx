import { formatCode } from '@treasurer/core';
import { membersOf } from '@treasurer/db';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGroup } from '@/lib/session';
import { createMember, retire } from '../actions';

export const dynamic = 'force-dynamic';

/** D18: the club is created by the CLI; this page is for what happens afterwards. */
export default async function MembersPage() {
  const groupId = await requireGroup();
  const members = await membersOf(await db(), groupId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.title}</h1>
        <Link href="/painel" className="text-muted-foreground text-sm underline">
          {t.event.expenses}
        </Link>
      </header>

      <ul className="flex flex-col">
        {members.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 border-t py-3">
            <span className="flex items-baseline gap-2">
              <span className="text-muted-foreground tabular-nums">{formatCode(member.code)}</span>
              <span>{member.name}</span>
              {member.retiredAt && (
                <span className="text-muted-foreground text-xs">{t.admin.retired}</span>
              )}
            </span>

            {!member.retiredAt && (
              <ActionForm action={retire}>
                <input type="hidden" name="memberId" value={member.id} />
                <SubmitButton variant="ghost" size="sm">
                  {t.admin.retire}
                </SubmitButton>
              </ActionForm>
            )}
          </li>
        ))}
      </ul>

      <ActionForm action={createMember} className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t.admin.name}</Label>
          <Input id="name" name="name" required />
        </div>
        <div>
          <SubmitButton>{t.admin.add}</SubmitButton>
        </div>
      </ActionForm>
    </main>
  );
}
