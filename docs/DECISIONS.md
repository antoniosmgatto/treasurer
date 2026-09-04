# Decisions

Settled design decisions, with the reasoning that produced them. Overturning one is fine —
doing it silently is not.

## D1 — Rounding surplus is accepted, and disclosed

Embedding a two-digit identification code in the cents requires rounding up to the whole unit,
which costs on average 0.50 per member, plus the code's own value on top. For a 12-person event
that is roughly **R$6–8 per event**, not the R$1–2 originally assumed, and it is systematically
uneven: member 15 always pays more than member 01.

We accept it — it is the price of unambiguous reconciliation, and it is cheap per person. But the
member's breakdown must show it as an explicit line (`arredondamento R$0,52 → caixa`). Money that
moves without being named is what destroys trust in a ledger.

**Revisit at v0.3:** if the bank statement turns out to expose the payment message field, the
whole cents scheme becomes unnecessary.

## D2 — `owed` and `charged` are different numbers

`owed` is the fair share and sums to zero across an event. `charged` is what we ask the member to
transfer, and is always ≥ `owed`. Reconciliation matches against `charged`; fairness is argued in
`owed`. Both are returned by the engine.

Invariants: `sum(owed) === 0`, and `sum(charged) − sum(owed) === treasury surplus`.

## D3 — The ledger is append-only

The engine folds a list of signed entries rather than computing a single event in isolation. An
event's settlement is a filter over the ledger; a member's running balance is the same fold
without the filter; the fund balance is that fold for the treasury row.

This is what lets an overpayment, a late payment, or a correction land somewhere. Corrections are
new entries, never edits — which also answers "who changed this?".

## D4 — One open event at a time (v0.1)

Codes identify the _member_, not the _charge_. With two events open, an incoming R$48,03 from
member 03 is genuinely ambiguous. Enforced as a model constraint, not a convention.

Revisit at v0.3 with real statement data, using an explicit oldest-charge-first rule.

## D5 — The CLI is a test harness, not a milestone

Nobody hand-writes JSON for a ten-person event after a ride. Its job is running fixtures and
checking the engine against events already settled by hand. The UI is the first genuinely usable
version.

## D6 — The treasury row and the treasurer are never the same row

The caixa is a member row with `isTreasury: true`, weight always 0, no human attached. The person
who holds it is an ordinary member row who owes their share like everyone else and happens to
have write access. Validation rejects a treasury row appearing as a participant.

Conflating them nets a personal share against the club fund and quietly corrupts every balance.

## D7 — Identification codes are never reused

Allocated from `01–99`. When a member leaves, their code retires with them. Reuse would
misattribute a late payment and make historical statements unreadable.

## D8 — Minimum personal data, and none of it in git

Real member data (names, phones, keys) is gitignored; the repository carries only an anonymized
example. Member payment keys are **not** stored: members pay the caixa, and the handful of people
reimbursed per event are paid from the treasurer's own phone.

Less data is less liability. This is a club, not a company with a data protection officer.

## D9 — Two links: one writes, one reads

The unguessable link is the credential, but a single link means any of fifteen people — or anyone
they forward it to — can alter the ledger. A treasurer link writes; a member link reads. Combined
with D3, alterations are impossible rather than merely discouraged.

## D10 — No RSVP or no-show policy in the POC

Participation is assigned by the treasurer after the fact. Recording commitment, absence, and the
rule connecting them is a policy engine, and the policy does not exist yet. Ship, run one real
event, and let an actual argument specify it.
