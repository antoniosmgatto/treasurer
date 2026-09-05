import type { Expense, Member } from '@treasurer/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/labels';

/**
 * The fields a bill is made of, rendered identically whether it is being added or corrected
 * (D31). A correction form that offered fewer fields than the original would decide, silently,
 * which mistakes are fixable — and the ones it left out would be the ones that mattered.
 *
 * Ids are suffixed per bill because several of these forms sit on the panel at once, and a
 * duplicated id sends every label to the first form on the page.
 */
export function BillFields({
  id,
  members,
  rosterIds,
  expense,
}: {
  id: string;
  members: readonly Member[];
  rosterIds: ReadonlySet<string>;
  /** The bill being corrected. Absent when adding one, which is what leaves the fields empty. */
  expense?: Expense;
}) {
  const payerId = expense
    ? expense.collector.kind === 'club'
      ? 'club'
      : expense.collector.memberId
    : undefined;

  /**
   * A bill with stored participants says exactly who is in; one without defers to the roster, so
   * everybody on it is ticked. Both are pre-ticked the same way the add form is (D12).
   */
  const inBill = new Set(
    expense && expense.participants.length > 0
      ? expense.participants.filter((entry) => entry.weight > 0).map((entry) => entry.memberId)
      : rosterIds,
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`description-${id}`}>{t.event.description}</Label>
        <Input
          id={`description-${id}`}
          name="description"
          defaultValue={expense?.description}
          required
        />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`amount-${id}`}>{t.event.amount}</Label>
          {/* D20: text, not number — a Brazilian keyboard types 158,73. */}
          <Input
            id={`amount-${id}`}
            name="amount"
            inputMode="decimal"
            placeholder="155,00"
            defaultValue={expense ? centsAsInput(expense.amount) : undefined}
            required
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`receiptTotal-${id}`}>{t.event.receiptTotal}</Label>
          <Input
            id={`receiptTotal-${id}`}
            name="receiptTotal"
            inputMode="decimal"
            placeholder="161,47"
            defaultValue={
              expense?.receiptTotal === undefined ? undefined : centsAsInput(expense.receiptTotal)
            }
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`payerId-${id}`}>{t.event.paidBy}</Label>
          <select
            id={`payerId-${id}`}
            name="payerId"
            defaultValue={payerId}
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
      {rosterIds.size > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{t.event.whoIsIn}</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {members
              .filter((member) => rosterIds.has(member.id))
              .map((member) => (
                <label key={member.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="participant"
                    value={member.id}
                    defaultChecked={inBill.has(member.id)}
                    className="size-4"
                  />
                  {member.name}
                </label>
              ))}
          </div>
          <p className="text-muted-foreground text-xs">{t.event.whoIsInHint}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`collectionKey-${id}`}>{t.event.collectionKey}</Label>
        <Input
          id={`collectionKey-${id}`}
          name="collectionKey"
          placeholder="41 99999-9999"
          defaultValue={expense?.collectionKey}
        />
        <p className="text-muted-foreground text-xs">{t.event.collectionKeyHint}</p>
      </div>
    </>
  );
}

/**
 * Back into the form in the shape the form expects: `15500` as `155,00`, which `parseBRL` reads
 * again on the way in. Integer arithmetic only — dividing by 100 here is how a corrected amount
 * would come back a centavo short.
 */
function centsAsInput(amount: number): string {
  const digits = String(Math.abs(amount)).padStart(3, '0');
  return `${amount < 0 ? '-' : ''}${digits.slice(0, -2)},${digits.slice(-2)}`;
}
