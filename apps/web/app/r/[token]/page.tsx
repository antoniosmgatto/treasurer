import { formatBRL, settle } from '@treasurer/core';
import { eventByShareToken, loadEvent } from '@treasurer/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';

export const dynamic = 'force-dynamic';

/**
 * The one link for a rolê, pasted into the group chat. Everybody holding it sees the whole table
 * (Q34): the public ledger is the mechanism — it is what stops the thread from being the record,
 * and what lets somebody notice they are the only one still open.
 *
 * The consequence, accepted: anyone with the link can act as anyone. Uploads append and never
 * destroy, and the audit log is the guard.
 */
export default async function EventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const connection = await db();

  const found = await eventByShareToken(connection, token);
  if (!found) notFound();

  const loaded = await loadEvent(connection, found.event.id);
  if (!loaded) notFound();

  // D15: no amounts at all until the treasurer has finished entering the bills.
  if (!found.event.chargesPublishedAt) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-5">
        <h1 className="text-2xl font-semibold tracking-tight">{found.event.name}</h1>
        <p className="text-muted-foreground">{t.member.notReady}</p>
      </main>
    );
  }

  const settlement = settle(loaded.event, loaded.members);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{found.event.name}</h1>
          <p className="text-muted-foreground text-sm">{found.event.date}</p>
        </div>
        <span className="tabular-nums">{formatBRL(settlement.total)}</span>
      </header>

      <section className="flex flex-col gap-1">
        <h2 className="text-muted-foreground text-xs">{t.share.tapYourName}</h2>
        {settlement.members.map((member) => (
          <Link
            key={member.memberId}
            href={`/r/${token}/${member.memberId}`}
            className="flex items-center justify-between gap-4 border-b py-3 text-sm last:border-b-0"
          >
            <span>{member.name}</span>
            <span className="tabular-nums">
              {member.owed > 0 ? formatBRL(member.owed) : `+ ${formatBRL(member.receiving)}`}
            </span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-muted-foreground text-xs">{t.settlement.collectors}</h2>
        {settlement.collectors.map((collector) => (
          <p key={collector.name} className="flex justify-between gap-4 text-sm">
            <span>
              {collector.name}
              {collector.key && <span className="text-muted-foreground"> · {collector.key}</span>}
            </span>
            <span className="tabular-nums">{formatBRL(collector.collecting)}</span>
          </p>
        ))}
      </section>
    </main>
  );
}
