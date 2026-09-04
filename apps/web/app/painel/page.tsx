import {
  chatSummary,
  formatBRL,
  formatCode,
  settle,
  type Collector,
  type Member,
} from '@treasurer/core';
import { balancesFor, loadEvent, membersOf, openEventFor } from '@treasurer/db';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { CopySummary } from '@/components/copy-summary';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGroup } from '@/lib/session';
import {
  addExpense,
  createEvent,
  markPaid,
  markReimbursed,
  publish,
  removeExpense,
  saveRoster,
} from './actions';

export const dynamic = 'force-dynamic';

function collectorName(collector: Collector, members: readonly Member[]): string {
  if (collector.kind === 'club') return t.event.club;
  return members.find((member) => member.id === collector.memberId)?.name ?? collector.memberId;
}

export default async function PanelPage() {
  const groupId = await requireGroup();
  const connection = await db();

  const members = await membersOf(connection, groupId);
  const event = await openEventFor(connection, groupId);

  if (!event) return <NewEvent />;

  const loaded = await loadEvent(connection, event.id);
  const settlement = loaded ? settle(loaded.event, loaded.members) : null;
  const balances = await balancesFor(connection, groupId);
  const roster = loaded?.event.expenses[0]?.participants ?? [];
  const rosterIds = new Set(roster.map((entry) => entry.memberId));
  const spending = members.filter((member) => !member.retiredAt);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <p className="text-muted-foreground text-sm">
            {event.date} ·{' '}
            <Link href="/painel/membros" className="underline">
              {t.event.members}
            </Link>
          </p>
        </div>
        {settlement && (
          <p className="text-right tabular-nums">
            <span className="text-muted-foreground block text-xs">{t.event.total}</span>
            <span className="text-lg font-medium">{formatBRL(settlement.total)}</span>
          </p>
        )}
      </header>

      {/* D12: set who came once; every expense defaults to them. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t.event.whoCame}</h2>
        <ActionForm action={saveRoster} className="flex flex-col gap-3">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="flex flex-wrap gap-2">
            {spending.map((member) => (
              <label
                key={member.id}
                className="border-input has-checked:bg-accent flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="memberId"
                  value={member.id}
                  defaultChecked={rosterIds.size === 0 || rosterIds.has(member.id)}
                  className="accent-foreground"
                />
                {member.name}
              </label>
            ))}
          </div>
          <div>
            <SubmitButton variant="secondary" size="sm">
              {t.event.saveRoster}
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t.event.expenses}</h2>
        {loaded && loaded.event.expenses.length === 0 && (
          <p className="text-muted-foreground text-sm">{t.event.noExpenses}</p>
        )}
        <ul className="flex flex-col gap-2">
          {loaded?.event.expenses.map((expense) => (
            <li key={expense.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {expense.description}
                <span className="text-muted-foreground">
                  {' · '}
                  {collectorName(expense.collector, members)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">{formatBRL(expense.amount)}</span>
                <ActionForm action={removeExpense}>
                  <input type="hidden" name="expenseId" value={expense.id} />
                  <SubmitButton variant="ghost" size="sm">
                    {t.event.remove}
                  </SubmitButton>
                </ActionForm>
              </span>
            </li>
          ))}
        </ul>

        <ActionForm action={addExpense} className="flex flex-col gap-3 border-t pt-4">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">{t.event.description}</Label>
            <Input id="description" name="description" required />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="amount">{t.event.amount}</Label>
              {/* D20: text, not number — a Brazilian keyboard types 158,73. */}
              <Input id="amount" name="amount" inputMode="decimal" placeholder="158,73" required />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="payerId">{t.event.paidBy}</Label>
              <select
                id="payerId"
                name="payerId"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
                required
              >
                {members
                  .filter((member) => !member.retiredAt)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                {/* D25: the club is a label with a key, not a member row. */}
                <option value="club">{t.event.club}</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collectionKey">{t.event.collectionKey}</Label>
            <Input id="collectionKey" name="collectionKey" placeholder="41 99999-9999" />
            <p className="text-muted-foreground text-xs">{t.event.collectionKeyHint}</p>
          </div>
          <div>
            <SubmitButton>{t.event.addExpense}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {settlement && settlement.members.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t.settlement.toPay}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="pb-2 font-normal">{t.settlement.member}</th>
                <th className="pb-2 text-right font-normal">{t.settlement.toPay}</th>
                <th className="pb-2 text-right font-normal">{t.settlement.receives}</th>
                <th className="pb-2 text-right font-normal">{t.settlement.paid}</th>
              </tr>
            </thead>
            <tbody>
              {settlement.members.map((member) => {
                const balance = balances.get(member.memberId) ?? 0;
                // Net decides the direction of the one button: somebody who both collects a bill
                // and owes on others is square with the group only once both sides have moved.
                const fronter = member.net > 0;
                // A debtor's balance climbs towards zero as they pay; a fronter's falls towards
                // zero as they are paid back. Both are settled when they reach it.
                const settled =
                  event.chargesPublishedAt !== null && (fronter ? balance <= 0 : balance >= 0);
                return (
                  <tr key={member.memberId} className="border-t">
                    <td className="py-2">
                      <span className="text-muted-foreground tabular-nums">
                        {formatCode(member.code)}
                      </span>{' '}
                      {member.name}
                      {/* One line per collector: the total alone does not say what to do. */}
                      {member.payments.length > 1 && (
                        <span className="text-muted-foreground block text-xs">
                          {member.payments
                            .map((payment) => `${payment.name} ${formatBRL(payment.amount)}`)
                            .join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {member.owed > 0 ? formatBRL(member.owed) : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {member.receiving > 0 ? formatBRL(member.receiving) : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {settled ? (
                        <span className="text-muted-foreground">✓</span>
                      ) : (
                        /* D13: one tap records that the money moved, in whichever direction. */
                        <ActionForm action={fronter ? markReimbursed : markPaid}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="memberId" value={member.memberId} />
                          <input
                            type="hidden"
                            name="amount"
                            value={String(fronter ? member.net : member.owed)}
                          />
                          <SubmitButton variant="ghost" size="sm">
                            {fronter ? t.settlement.markReimbursed : t.settlement.markPaid}
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* The other side of the table: who the money is going to, and where. */}
          <div className="flex flex-col gap-1 border-t pt-3">
            <h3 className="text-muted-foreground text-xs">{t.settlement.collectors}</h3>
            {settlement.collectors.map((collector) => (
              <p key={collector.name} className="flex justify-between gap-4 text-sm">
                <span>
                  {collector.name}
                  {collector.key && (
                    <span className="text-muted-foreground"> · {collector.key}</span>
                  )}
                </span>
                <span className="tabular-nums">{formatBRL(collector.collecting)}</span>
              </p>
            ))}
          </div>

          <p className="text-muted-foreground text-xs">
            {t.settlement.rounding}: {formatBRL(settlement.rounding)}
          </p>

          {!event.chargesPublishedAt && (
            <ActionForm action={publish}>
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton>{t.event.publish}</SubmitButton>
            </ActionForm>
          )}
          {event.chargesPublishedAt && loaded && (
            <>
              <p className="text-muted-foreground text-sm">{t.event.published}</p>
              {/* Only once published: pasting amounts that are still moving is how a group chat
                  became the ledger in the first place (D15). */}
              <CopySummary text={chatSummary(loaded.event, settlement)} />
            </>
          )}
        </section>
      )}
    </main>
  );
}

function NewEvent() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t.event.newEvent}</h1>
      <ActionForm action={createEvent} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t.event.name}</Label>
          <Input id="name" name="name" placeholder="Churrasco" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">{t.event.date}</Label>
          <Input id="date" name="date" type="date" />
        </div>
        <div>
          <SubmitButton>{t.event.create}</SubmitButton>
        </div>
      </ActionForm>
    </main>
  );
}
