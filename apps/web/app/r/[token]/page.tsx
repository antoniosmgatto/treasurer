import { formatBRL, settle } from '@treasurer/core';
import { eventByShareToken, loadEvent } from '@treasurer/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareEvent } from '@/components/share-event';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';

export const dynamic = 'force-dynamic';

/**
 * What a forwarded link says about the club: the rolê, when it was, how many went. No amounts,
 * and never the group's name (D30).
 *
 * A preview renders in chats nobody here will ever see, and the link is permanent by design — so
 * the card has to be safe in the hands of somebody who was never on the trip. Search engines are
 * turned away for the same reason.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const found = await eventByShareToken(await db(), token);
  if (!found) return { title: t.appName, robots: { index: false, follow: false } };

  const loaded = await loadEvent(await db(), found.event.id);
  const headcount = (loaded?.roster ?? []).filter((entry) => entry.weight > 0).length;
  const description = `${found.event.date} · ${headcount} ${t.share.people}`;

  return {
    title: found.event.name,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: found.event.name, description, type: 'website' },
    twitter: { card: 'summary', title: found.event.name, description },
  };
}

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
        <p className="text-muted-foreground text-sm">{found.event.date}</p>
        {/* D31: the description is why this page is worth opening before the bills exist. */}
        {found.event.description && (
          <p className="whitespace-pre-line">{found.event.description}</p>
        )}
        <p className="text-muted-foreground">{t.member.notReady}</p>
        <ShareEvent token={token} name={found.event.name} date={found.event.date} />
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

      {/* D30 keeps this off the link preview: free text can name the club or an amount, and
          the card is read by people who never tapped through. */}
      {found.event.description && (
        <p className="text-sm whitespace-pre-line">{found.event.description}</p>
      )}

      <ShareEvent token={token} name={found.event.name} date={found.event.date} />

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
