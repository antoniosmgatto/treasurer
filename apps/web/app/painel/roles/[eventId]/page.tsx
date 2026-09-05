import {
  cents,
  chatSummary,
  formatBRL,
  formatCode,
  settle,
  type Cents,
  type Collector,
  type Expense,
  type Member,
  type MemberSettlement,
} from '@treasurer/core';
import { eventIn, loadEvent, positionsIn, type Position } from '@treasurer/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { BillFields } from '@/components/bill-fields';
import { CopySummary } from '@/components/copy-summary';
import { ShareEvent } from '@/components/share-event';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { t } from '@/lib/labels';
import { requireGroup } from '@/lib/session';
import {
  addExpense,
  addGuestToEvent,
  describe,
  editExpense,
  markPaid,
  markReimbursed,
  publish,
  removeExpense,
  saveRoster,
  settleEvent,
} from '../../actions';

export const dynamic = 'force-dynamic';

function excludedFrom(expense: Expense, members: readonly Member[]): string[] {
  return expense.participants
    .filter((participant) => participant.weight === 0)
    .map(
      (participant) =>
        members.find((member) => member.id === participant.memberId)?.name ?? participant.memberId,
    );
}

function collectorName(collector: Collector, members: readonly Member[]): string {
  if (collector.kind === 'club') return t.event.club;
  return members.find((member) => member.id === collector.memberId)?.name ?? collector.memberId;
}

/**
 * Where one member stands on one event, once the charges have been recorded.
 *
 * D31: a payment that squared a charge is not wrong because the charge moved underneath it — it
 * is a payment somebody now has to look at. Recording it as "recebido" and letting the balance
 * quietly drift is the failure this distinguishes: `moved` says money changed hands, and the
 * balance says whether it still adds up.
 */
type MemberState =
  | { kind: 'settled' | 'open' }
  /** `in`: money still has to come from them. `back`: money has to go back to them. */
  | { kind: 'review'; direction: 'in' | 'back'; amount: Cents };

function stateOf(member: MemberSettlement, position: Position | undefined): MemberState {
  // Nobody excluded from everything should be asked to transfer R$ 0,00.
  if (member.owed === 0 && member.net === 0) return { kind: 'settled' };
  if (!position || position.moved === 0) return { kind: 'open' };

  const balance = cents(position.charged + position.moved);
  if (balance === 0) return { kind: 'settled' };

  /**
   * The direction comes from the balance, never from whether they fronted a bill: a debtor who
   * overpaid and a fronter who was under-reimbursed are the same fact — the club is holding money
   * that is not its own.
   */
  return balance < 0
    ? { kind: 'review', direction: 'in', amount: cents(-balance) }
    : { kind: 'review', direction: 'back', amount: balance };
}

/**
 * One rolê, at its own URL. Since D33 a group can have several open at the same time, so this is
 * where a rolê is worked on rather than `/painel` — which lists them and knows nothing else.
 *
 * Open, it is the whole workspace: who came, the bills, the rateio. Closed, it is the record of
 * what happened, which is read-only because D31 stops corrections at *encerrar* and not before.
 */
export default async function RolePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const groupId = await requireGroup();
  const connection = await db();

  // Scoped to the group behind the write token: an event id is not a credential.
  const event = await eventIn(connection, groupId, eventId);
  if (!event) notFound();

  const loaded = await loadEvent(connection, eventId);
  if (!loaded) notFound();

  // The club, plus whichever guests came to this rolê and to nothing else (D29).
  const members = loaded.members;
  const settlement = settle(loaded.event, loaded.members);
  // Per event, not per club: two trips folded into one balance makes the second unreadable.
  const positions = await positionsIn(connection, eventId);
  // Weight 0 is on the roster but excluded from a bill; only the ones who came are pre-ticked.
  const rosterIds = new Set(
    loaded.roster.filter((entry) => entry.weight > 0).map((e) => e.memberId),
  );
  const spending = members.filter((member) => !member.retiredAt);
  const closed = event.status === 'settled';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <p className="text-muted-foreground text-sm">
            {event.date} · {closed ? t.event.closed : t.event.open} ·{' '}
            <Link href="/painel" className="underline">
              {t.event.backToPanel}
            </Link>
          </p>
        </div>
        <p className="text-right tabular-nums">
          <span className="text-muted-foreground block text-xs">{t.event.total}</span>
          <span className="text-lg font-medium">{formatBRL(settlement.total)}</span>
        </p>
      </header>

      {closed ? (
        <>
          {/* Whatever the rolê said about itself, kept with it (D31). */}
          {event.description && <p className="text-sm whitespace-pre-line">{event.description}</p>}

          <section className="flex flex-col gap-2">
            <h2 className="font-medium">{t.event.expenses}</h2>
            {loaded.event.expenses.map((expense) => (
              <p key={expense.id} className="flex justify-between gap-4 text-sm">
                <span>{expense.description}</span>
                <span className="tabular-nums">{formatBRL(expense.amount)}</span>
              </p>
            ))}
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

          {/* The link keeps working after the rolê is closed: one people forwarded has to. */}
          <div className="flex flex-col gap-1 border-t pt-4">
            <h3 className="text-muted-foreground text-xs">{t.share.link}</h3>
            <ShareEvent token={event.shareToken} name={event.name} date={event.date} />
          </div>
        </>
      ) : (
        <>
          {/* D31: what the rolê is called, when it was, and what it tells people. All correctable
              while it is open — the description is what somebody reads before any bill exists. */}
          <details open={!event.description}>
            <summary className="cursor-pointer text-sm font-medium">{t.event.about}</summary>
            {event.description && (
              <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">
                {event.description}
              </p>
            )}
            <ActionForm action={describe} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="eventId" value={event.id} />
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="eventName">{t.event.name}</Label>
                  <Input id="eventName" name="name" defaultValue={event.name} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="eventDate">{t.event.date}</Label>
                  <Input
                    id="eventDate"
                    name="date"
                    type="date"
                    defaultValue={event.date}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="eventDescription">{t.event.aboutField}</Label>
                <textarea
                  id="eventDescription"
                  name="description"
                  rows={3}
                  defaultValue={event.description ?? ''}
                  className="border-input rounded-md border bg-transparent px-3 py-2 text-sm"
                />
                <p className="text-muted-foreground text-xs">{t.event.aboutHint}</p>
              </div>
              <div>
                <SubmitButton variant="secondary" size="sm">
                  {t.event.saveAbout}
                </SubmitButton>
              </div>
            </ActionForm>
          </details>

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
                    {/* A guest is on this event and nowhere else (D29). */}
                    {member.code === undefined && (
                      <span className="text-muted-foreground text-xs">{t.event.guest}</span>
                    )}
                  </label>
                ))}
              </div>
              <div>
                <SubmitButton variant="secondary" size="sm">
                  {t.event.saveRoster}
                </SubmitButton>
              </div>
            </ActionForm>

            <ActionForm action={addGuestToEvent} className="flex items-end gap-2">
              <input type="hidden" name="eventId" value={event.id} />
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="guestName">{t.event.guestName}</Label>
                <Input id="guestName" name="name" placeholder="Amigo do Membro 02" required />
              </div>
              <SubmitButton variant="secondary" size="sm">
                {t.event.addGuest}
              </SubmitButton>
            </ActionForm>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-medium">{t.event.expenses}</h2>
            {loaded.event.expenses.length === 0 && (
              <p className="text-muted-foreground text-sm">{t.event.noExpenses}</p>
            )}
            <ul className="flex flex-col gap-2">
              {loaded.event.expenses.map((expense) => (
                <li key={expense.id} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {expense.description}
                      <span className="text-muted-foreground">
                        {' · '}
                        {collectorName(expense.collector, members)}
                      </span>
                      {/* D1: an exclusion is stated on the bill, not left for somebody to notice. */}
                      {excludedFrom(expense, members).length > 0 && (
                        <span className="text-muted-foreground block text-xs">
                          {t.event.without} {excludedFrom(expense, members).join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {formatBRL(expense.amount)}
                        {/* Both numbers are true; showing one of them makes somebody look wrong. */}
                        {expense.receiptTotal !== undefined &&
                          expense.receiptTotal !== expense.amount && (
                            <span className="text-muted-foreground block text-xs">
                              {t.event.note} {formatBRL(expense.receiptTotal)}
                            </span>
                          )}
                      </span>
                      <ActionForm action={removeExpense}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="expenseId" value={expense.id} />
                        <SubmitButton variant="ghost" size="sm">
                          {t.event.remove}
                        </SubmitButton>
                      </ActionForm>
                    </span>
                  </div>

                  {/* D31: the receipt was read wrong, or the buyer remembered the number late. The
                      bill is fixable until the rolê is encerrado, and not one moment less. */}
                  <details className="mt-1">
                    <summary className="text-muted-foreground cursor-pointer text-xs">
                      {t.event.edit}
                    </summary>
                    <ActionForm
                      action={editExpense}
                      className="bg-muted/40 mt-2 flex flex-col gap-3 rounded-lg p-3"
                    >
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="expenseId" value={expense.id} />
                      <BillFields
                        id={expense.id}
                        members={members}
                        rosterIds={rosterIds}
                        expense={expense}
                      />
                      <div>
                        <SubmitButton size="sm">{t.event.saveExpense}</SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>

            <ActionForm action={addExpense} className="flex flex-col gap-3 border-t pt-4">
              <input type="hidden" name="eventId" value={event.id} />
              <BillFields id="novo" members={members} rosterIds={rosterIds} />
              <div>
                <SubmitButton>{t.event.addExpense}</SubmitButton>
              </div>
            </ActionForm>

            <p className="text-muted-foreground text-xs">{t.event.correctionHint}</p>
          </section>

          {settlement.members.length > 0 && (
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
                    // Net decides the direction of the one button: somebody who both collects a
                    // bill and owes on others is square only once both sides have moved.
                    const fronter = member.net > 0;
                    const state = stateOf(member, positions.get(member.memberId));
                    const settled = state.kind === 'settled';
                    return (
                      <tr key={member.memberId} className="border-t">
                        <td className="py-2">
                          <span className="text-muted-foreground tabular-nums">
                            {member.code === undefined ? '—' : formatCode(member.code)}
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
                            <>
                              {/* D31: they paid, and then the bill moved under them. Naming the
                                  gap is the whole point — the alternative is a number that went
                                  wrong and a person who is told nothing about it. */}
                              {state.kind === 'review' && (
                                <span className="text-destructive block text-xs">
                                  {t.settlement.needsReview}:{' '}
                                  {state.direction === 'in'
                                    ? t.settlement.short
                                    : t.settlement.toReturn}{' '}
                                  <span className="tabular-nums">{formatBRL(state.amount)}</span>
                                </span>
                              )}
                              {/* D13: one tap records that the money moved, in whichever
                                  direction. After a correction the direction is the gap's, not
                                  the member's role: whoever is holding money that is not theirs
                                  hands it over. */}
                              <ActionForm
                                action={
                                  (state.kind === 'review' ? state.direction === 'back' : fronter)
                                    ? markReimbursed
                                    : markPaid
                                }
                              >
                                <input type="hidden" name="eventId" value={event.id} />
                                <input type="hidden" name="memberId" value={member.memberId} />
                                <input
                                  type="hidden"
                                  name="amount"
                                  value={String(
                                    state.kind === 'review'
                                      ? state.amount
                                      : fronter
                                        ? member.net
                                        : member.owed,
                                  )}
                                />
                                <SubmitButton variant="ghost" size="sm">
                                  {(state.kind === 'review' ? state.direction === 'back' : fronter)
                                    ? t.settlement.markReimbursed
                                    : t.settlement.markPaid}
                                </SubmitButton>
                              </ActionForm>
                            </>
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
              {settlement.members.some(
                (member) => stateOf(member, positions.get(member.memberId)).kind === 'review',
              ) && <p className="text-muted-foreground text-xs">{t.settlement.needsReviewHint}</p>}

              {!event.chargesPublishedAt && (
                <ActionForm action={publish}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <SubmitButton>{t.event.publish}</SubmitButton>
                </ActionForm>
              )}
              {event.chargesPublishedAt && (
                <>
                  <p className="text-muted-foreground text-sm">{t.event.published}</p>
                  {/* Only once published: pasting amounts that are still moving is how a group
                      chat became the ledger in the first place (D15). */}
                  <CopySummary text={chatSummary(loaded.event, settlement)} />

                  {/* One link for the whole rolê: what actually gets pasted in the group (Q12). */}
                  <div className="flex flex-col gap-1 border-t pt-4">
                    <h3 className="text-muted-foreground text-xs">{t.share.link}</h3>
                    <ShareEvent token={event.shareToken} name={event.name} date={event.date} />
                  </div>

                  {/* Closing stops the corrections (D31). It no longer gates the next rolê —
                      since D33 one can already be open alongside this — so it closes whatever
                      the state of the payments; somebody who pays late holds nobody up. */}
                  <ActionForm action={settleEvent} className="flex flex-col gap-2 border-t pt-4">
                    <input type="hidden" name="eventId" value={event.id} />
                    <p className="text-muted-foreground text-xs">{t.event.settleHint}</p>
                    <div>
                      <SubmitButton variant="secondary" size="sm">
                        {t.event.settle}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
