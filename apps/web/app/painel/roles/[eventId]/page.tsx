import { chatSummary, formatBRL, settle } from '@treasurer/core';
import { eventsOf, loadEvent } from '@treasurer/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopySummary } from '@/components/copy-summary';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGroup } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * A rolê that has been closed, read only. Closing used to make an event invisible — the panel and
 * the member view both asked for the open one — so the record of who paid what disappeared the
 * moment it was finished, which is the opposite of the point.
 */
export default async function PastEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const groupId = await requireGroup();
  const connection = await db();

  // Scoped to the group behind the write token: an event id is not a credential.
  const mine = (await eventsOf(connection, groupId)).find((entry) => entry.id === eventId);
  if (!mine) notFound();

  const loaded = await loadEvent(connection, eventId);
  if (!loaded) notFound();
  const settlement = settle(loaded.event, loaded.members);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{mine.name}</h1>
          <p className="text-muted-foreground text-sm">
            {mine.date} · {mine.status === 'settled' ? t.event.closed : t.event.open}
          </p>
        </div>
        <Link href="/painel" className="text-sm underline underline-offset-4">
          {t.event.backToPanel}
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t.event.expenses}</h2>
        {loaded.event.expenses.map((expense) => (
          <p key={expense.id} className="flex justify-between gap-4 text-sm">
            <span>{expense.description}</span>
            <span className="tabular-nums">{formatBRL(expense.amount)}</span>
          </p>
        ))}
        <p className="flex justify-between gap-4 border-t pt-2 text-sm font-medium">
          <span>{t.event.total}</span>
          <span className="tabular-nums">{formatBRL(settlement.total)}</span>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t.settlement.toPay}</h2>
        {settlement.members.map((member) => (
          <p key={member.memberId} className="flex justify-between gap-4 text-sm">
            <span>{member.name}</span>
            <span className="tabular-nums">
              {member.owed > 0 ? formatBRL(member.owed) : formatBRL(member.receiving)}
            </span>
          </p>
        ))}
      </section>

      <CopySummary text={chatSummary(loaded.event, settlement)} />
    </main>
  );
}
