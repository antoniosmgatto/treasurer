import { formatBRL, settle } from '@treasurer/core';
import { eventByShareToken, loadEvent, positionsIn } from '@treasurer/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';

export const dynamic = 'force-dynamic';

/** One person's own line, reached by tapping their name on the rolê everybody can open. */
export default async function MemberOnEventPage({
  params,
}: {
  params: Promise<{ token: string; memberId: string }>;
}) {
  const { token, memberId } = await params;
  const connection = await db();

  const found = await eventByShareToken(connection, token);
  if (!found?.event.chargesPublishedAt) notFound();

  const loaded = await loadEvent(connection, found.event.id);
  if (!loaded) notFound();

  const settlement = settle(loaded.event, loaded.members);
  const mine = settlement.members.find((member) => member.memberId === memberId);
  if (!mine) notFound();

  /**
   * D31: they paid, and then a bill was corrected under them. They are the last person who should
   * find that out from somebody else — the amount above is already the new one, so the page has
   * to say why it no longer matches the transfer they made.
   */
  const position = (await positionsIn(connection, found.event.id)).get(memberId);
  const changed =
    position !== undefined && position.moved !== 0 && position.charged + position.moved !== 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-5">
      <header>
        <Link href={`/r/${token}`} className="text-muted-foreground text-sm underline-offset-4">
          ← {found.event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{mine.name}</h1>
      </header>

      <div className="bg-muted rounded-xl p-5">
        <p className="text-muted-foreground text-sm">
          {mine.owed > 0 ? t.member.toPay : t.member.youReceive}
        </p>
        <p className="text-4xl font-semibold tabular-nums">
          {formatBRL(mine.owed > 0 ? mine.owed : mine.receiving)}
        </p>
      </div>

      {changed && (
        <p className="border-destructive text-destructive rounded-lg border px-3 py-2 text-sm">
          {t.member.changed}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2 text-sm">
          {mine.lines.map((line) => (
            <li key={line.expenseId} className="flex justify-between gap-4">
              <span className={line.excluded ? 'text-muted-foreground' : undefined}>
                {line.description}
                {/* D1: an exclusion is shown, never dropped. */}
                {line.excluded && ` (${t.member.broughtOwn})`}
              </span>
              <span className="tabular-nums">{formatBRL(line.amount)}</span>
            </li>
          ))}
        </ul>

        {mine.payments.length > 0 && (
          <>
            <hr className="border-border" />
            <h2 className="text-muted-foreground text-xs">{t.member.payTo}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {mine.payments.map((payment) => (
                <li key={payment.name} className="flex justify-between gap-4">
                  <span>
                    {payment.name}
                    {payment.key && (
                      <span className="text-muted-foreground block text-xs">{payment.key}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatBRL(payment.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">{t.member.roundedUp}</p>
          </>
        )}
      </section>
    </main>
  );
}
