import { formatBRL, formatCode, settle } from '@treasurer/core';
import {
  balancesFor,
  lastEventFor,
  loadEvent,
  memberByReadToken,
  openEventFor,
} from '@treasurer/db';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';

export const dynamic = 'force-dynamic';

/**
 * D11: this link belongs to one member and lands on their own number. No list to scan, no name to
 * find — the thing they came for is the first thing on the page.
 */
export default async function MemberPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const connection = await db();

  const found = await memberByReadToken(connection, token);
  if (!found) notFound();

  /**
   * The open rolê when there is one, otherwise the last one there was. A member who taps their
   * link the week after a trip was closed should still find what they paid — closing an event is
   * not the same as deleting it.
   */
  const openEvent =
    (await openEventFor(connection, found.groupId)) ??
    (await lastEventFor(connection, found.groupId));
  if (!openEvent) {
    return <Empty name={found.member.name}>{t.member.noEvent}</Empty>;
  }

  // D15: no amount at all until the treasurer has finished entering expenses.
  if (!openEvent.chargesPublishedAt) {
    return <Empty name={found.member.name}>{t.member.notReady}</Empty>;
  }

  const loaded = await loadEvent(connection, openEvent.id);
  if (!loaded) notFound();

  const settlement = settle(loaded.event, loaded.members);
  const mine = settlement.members.find((entry) => entry.memberId === found.member.id);

  /**
   * What they owe comes from the expenses, but whether they have paid comes from the ledger — the
   * settlement alone cannot know, and showing "a pagar" to somebody who already paid is how an
   * app loses the trust it exists to create.
   */
  const balance = (await balancesFor(connection, found.groupId)).get(found.member.id) ?? 0;
  const paid = mine !== undefined && mine.owed > 0 && balance >= 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-5">
      <header>
        <p className="text-muted-foreground text-sm">{loaded.event.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{found.member.name}</h1>
      </header>

      {!mine || paid || (mine.owed === 0 && mine.net === 0) ? (
        <Headline label={t.member.settled} />
      ) : mine.owed > 0 ? (
        <section className="flex flex-col gap-2">
          <Headline label={t.member.toPay} amount={formatBRL(mine.owed)} />
          <p className="text-muted-foreground text-sm">{t.member.exact}</p>
        </section>
      ) : (
        <Headline label={t.member.youReceive} amount={formatBRL(mine.receiving)} />
      )}

      {mine && (
        <section className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2 text-sm">
            {mine.lines.map((line) => (
              <li key={line.expenseId} className="flex justify-between gap-4">
                <span className={line.excluded ? 'text-muted-foreground' : undefined}>
                  {line.description}
                  {/* D1: an exclusion is shown, never dropped — a missing line reads as a mistake. */}
                  {line.excluded && ` (${t.member.broughtOwn})`}
                </span>
                <span className="tabular-nums">{formatBRL(line.amount)}</span>
              </li>
            ))}
          </ul>

          {mine.owed > 0 && !paid && (
            <>
              <hr className="border-border" />
              {/* The amount alone is not actionable: it is several transfers, to several people. */}
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
              {/* D1: the rounding is named, never buried. */}
              <p className="text-muted-foreground text-xs">{t.member.roundedUp}</p>
            </>
          )}

          {/* The other side of the same centavos: they stay with whoever collected the bill. */}
          {mine.rounding > 0 && (
            <dl className="flex flex-col gap-1 text-sm">
              <Row label={t.member.roundingKept} value={formatBRL(mine.rounding)} muted />
            </dl>
          )}
        </section>
      )}

      <footer className="text-muted-foreground mt-auto text-xs">
        {found.member.code !== undefined && `${t.settlement.code} ${formatCode(found.member.code)}`}
      </footer>
    </main>
  );
}

function Headline({ label, amount }: { label: string; amount?: string }) {
  return (
    <div className="bg-muted rounded-xl p-5">
      <p className="text-muted-foreground text-sm">{label}</p>
      {amount && <p className="text-4xl font-semibold tabular-nums">{amount}</p>}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${muted ? 'text-muted-foreground' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Empty({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="text-muted-foreground">{children}</p>
    </main>
  );
}
