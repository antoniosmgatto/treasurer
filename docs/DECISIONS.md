# Decisions

Settled design decisions, with the reasoning that produced them. Overturning one is fine —
doing it silently is not.

## D1 — Rounding is accepted, and disclosed — _amended by D24_

Embedding a two-digit identification code in the cents requires rounding up to the whole unit,
which costs on average 0.50 per member, plus the code's own value on top. For a 12-person event
that is roughly **R$6–8 per event**, not the R$1–2 originally assumed, and it is systematically
uneven: member 15 always pays more than member 01.

We accept it — it is the price of unambiguous reconciliation, and it is cheap per person. But the
member's breakdown must show it as an explicit line (`arredondamento R$0,52 → caixa`). Money that
moves without being named is what destroys trust in a ledger.

**Amended by D24:** the cents no longer carry the code, so the amounts here are historical. What
survives is the rule that produced them — rounding is shown as its own line, never folded into a
share.

## D2 — `owed` and `charged` are different numbers — _superseded by D24_

`owed` is the fair share and sums to zero across an event. `charged` is what we ask the member to
transfer, and is always ≥ `owed`. Reconciliation matches against `charged`; fairness is argued in
`owed`. Both are returned by the engine.

Invariants: `sum(owed) === 0`, and `sum(charged) − sum(owed) === treasury surplus`.

**Superseded by D24.** There is one number again: the member's share, rounded up to the cent. The
engine no longer returns `charged`.

## D3 — The ledger is append-only

The engine folds a list of signed entries rather than computing a single event in isolation. An
event's settlement is a filter over the ledger; a member's running balance is the same fold
without the filter.

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

## D6 — The treasury row and the treasurer are never the same row — _superseded by D25_

The caixa is a member row with `isTreasury: true`, weight always 0, no human attached. The person
who holds it is an ordinary member row who owes their share like everyone else and happens to
have write access. Validation rejects a treasury row appearing as a participant.

Conflating them nets a personal share against the club fund and quietly corrupts every balance.

**Superseded by D25.** There is no treasury row at all.

## D7 — Identification codes are never reused

Allocated from `01–99`. When a member leaves, their code retires with them. Reuse would
misattribute a late payment and make historical statements unreadable.

## D8 — Minimum personal data, and none of it in git

Real member data (names, phones, keys) is gitignored; the repository carries only an anonymized
example. Member payment keys are **not** stored as profile data; whoever collects a bill types the
key that bill is collected to.

Less data is less liability. This is a club, not a company with a data protection officer.

## D9 — Two links: one writes, one reads

The unguessable link is the credential, but a single link means any of fifteen people — or anyone
they forward it to — can alter the ledger. A treasurer link writes; a member link reads. Combined
with D3, alterations are impossible rather than merely discouraged.

## D10 — No RSVP or no-show policy in the POC

Participation is assigned by the treasurer after the fact. Recording commitment, absence, and the
rule connecting them is a policy engine, and the policy does not exist yet. Ship, run one real
event, and let an actual argument specify it.

---

# Phase 4 — the screens

## D11 — The read link identifies the member, not the group

A member opening a link to fifteen rows and hunting for their own name is the friction that sends
people back to the group chat. Their link lands on their own amount; the full event is one tap
away, and every member can see what everyone owes — a ledger nobody can audit is the problem
being solved, not the solution.

## D12 — The event has a roster; expense participants are overrides

Participants belong to the expense, because exclusions are per-expense. But entering three
expenses against ten people is thirty taps on a phone after a ride, and that gets done once.

So the event carries a roster of who came, every expense defaults to it, and per-expense
exclusion is an override touched two or three times a night. The engine is unchanged: the
repository expands the roster into per-expense participants before it hands anything over.

## D13 — Payments are recorded in Phase 4, by hand

The POC is finished when an event balances and everyone has paid. Without somewhere to record
that money arrived, the treasurer settles up in WhatsApp again and this is a calculator.

The treasurer taps a member, a `payment` entry is appended, the member's link says `quitado`. No
import, no matching — that is v0.3.

## D14 — The write token becomes a cookie on first visit

A credential in the URL bar lands in history, in the browser's recent list, and — realistically —
in a screenshot when the treasurer shows somebody the app. The token is exchanged for an httpOnly
cookie and the URL is cleaned by redirect. The link stays the way in; it stops being on screen.

## D15 — `charges_published_at`, not a state machine

Charges exist the moment the first expense is saved. A member opening their link mid-entry would
see a partial amount, pay it, and create the exact reconciliation mess this app exists to remove.

One nullable timestamp. Before it is set, the member's link says the rateio is still being closed
and shows no amount. `open` and `settled` remain the only states.

## D16 — Server components and server actions

Six screens, used a few times a month, often on bad rural signal, by people who will not install
anything. Pages are rendered on the server and read through `@treasurer/db`; writes are server
actions. No client state library, no form library. The member's page is a document, not an
application.

## D17 — Tailwind and shadcn/ui

Tailwind v4, which needs no config file, with shadcn/ui components copied into the repo rather
than imported as a dependency — so they can be edited like any other code here.

## D18 — The CLI bootstraps, the admin page operates

The first group cannot be created through a page whose access requires a token that group would
have issued. So `treasurer seed` creates the group, the caixa, the members and their links; the
admin page handles what happens afterwards, when there is no terminal — somebody joined, somebody
left, somebody lost their link. Both write through the same repository functions.

## D19 — Soft delete everywhere; nothing is ever destroyed

No row is ever removed. Members, expenses and events carry a `deleted_at` and disappear from the
places that would offer them, while remaining in the history that referenced them.

Two distinct ideas, deliberately kept apart:

- `retired_at` — a member left the club. Legitimate history; their code stays spent forever (D7),
  and they remain visible on the events they took part in.
- `deleted_at` — the row was a mistake. Hidden everywhere, still recoverable.

Deleting an expense that has already produced ledger entries appends reversing entries rather
than removing the originals, because the ledger is append-only (D3). A correction is always
something added, never something erased.

## D20 — Amounts are typed as text

`<input type="number">` fights the comma on a Brazilian keyboard, lets a scroll wheel change a
value, and treats `158.73` as a different number than the person meant. A text input with
`inputMode="decimal"` is parsed by `parseBRL`, which already accepts every shape a person types,
and the parsed amount is echoed back before saving. A failed parse names the field; it never
rounds to something plausible.

## D21 — Docker Postgres for development, PGlite for tests

PGlite was chosen so that nothing had to be installed and no credentials existed (D8). That still
holds for the test suite, which opens an in-memory PGlite per test file: perfectly isolated, no
container, and CI needs no services.

The file-backed variant used by `pnpm dev` is a different story. PGlite is single-writer, so the
dev server and the CLI cannot both hold `.data/` — the second blocks on a lock, forever, with no
error. Seeding a club while the app is running is a completely ordinary thing to want, and it was
impossible.

So development gets a real Postgres from `docker-compose.yml`, matching the version deployed, and
the PGlite file stays as the fallback for anyone who has not started it. Three databases sounds
like too many; in practice each one is doing something the others cannot.

Two bugs came out of this, both from `connect` never offering a way to close what it opened:
`postgres-js` kept a socket open so CLI commands never exited, and PGlite kept the directory lock
so the _next_ command hung. `disconnect` now exists and the CLI uses it.

## D22 — Migrations are tracked, not replayed

`applyMigrations` re-ran every file on every call, which was fine while the only database was a
throwaway. On the day this deployed, the second `treasurer migrate` against a live database died
on `type "entry_kind" already exists`.

Applied migrations are now recorded in a `_migration` table and skipped on later runs. A database
that was migrated before that table existed is adopted by recording the baseline rather than
attempting to create the schema twice — only the initial migration ever shipped untracked, so it
is the only one that may be assumed.

## D23 — The write link can be reissued

`seed` printed the links once and nothing could print them again. Two things followed from that.
A treasurer who lost their terminal scrollback was locked out of their own panel, with the token
recoverable only by hand-written SQL. And a write link that leaked — a screenshot, a pasted chat
message, a support thread — stayed valid forever, because there was no way to invalidate it.

`treasurer links` reprints them, and `treasurer links --rotate` issues a new write token. The old
URL stops resolving immediately; member links are untouched, since they leak independently and
revoking all of them to fix one is the wrong trade.

This is what D9's two links imply once they exist in the world rather than in a design: an
unguessable URL is a password, and passwords have to be replaceable.

## D24 — Shares round up to the cent, and the rounding stays with the collector

Every share is rounded **up**, so the shares always add up to at least the bill and whoever fronted
the money is never left short. The excess — under one cent per member, a few centavos per bill —
is credited back to them as its own ledger entry, and shown (D1).

This replaces rounding up to the whole real with the member's identification code in the cents
(D2). That scheme cost each member up to R$0,99 per bill, which was defensible while the surplus
fed the club's cash box. With the caixa gone (D25) those centavos would land in a private account
instead, and the codes cannot be reconciled against a statement nobody has connected yet.

The codes themselves stay on the member, out of the amount. A collector who links their own bank
account can put them back into the cents of their own charges — they are the one who gets
something back for it.

## D25 — There is no caixa

The club's cash box is gone: no treasury member row, no `isTreasury`, no running fund. Events are
isolated, and only the health of one event matters.

Every bill names its own collector, chosen by whoever adds it — a member's key, or the club's. The
club is a label plus a key on a bill rather than an entity with a balance.

This reverses the hub and spoke the project started from, and reintroduces the web of small debts
it set out to replace. The difference is who holds that web: the app computes it, records it and
chases it, instead of a member keeping three Pix keys in his head.

The migration that drops the column also soft-deletes the caixa rows (D19), so past events keep
whatever it fronted.

## D26 — Debts are gross between collectors, never netted

If two members each collect a bill the other took part in, both transfers happen. m01 pays m02
R$15,88 for the dinner and m02 pays m01 R$15,50 for the meat, rather than one of them sending the
R$0,38 difference.

Netting would save a transfer and cost the only thing that makes a payment checkable: that it
lines up with one collector's bills. Phase 8 asks somebody to attach a receipt to a payment and
somebody else to confirm it — a netted figure matches no bill, no share and no receipt, and the
first person asked to verify one would have to redo the arithmetic by hand.

It is also what the group already does. The message that started this project listed three
amounts to three people, not a set of optimized transfers.

## D27 — A bill collected by the club is a bill the club paid for

The collector of a bill is whoever fronted it, and that is either a member or the club. There is
no third case where a member fronts money and the club collects on his behalf, because the club
would then owe him — and an obligation the club carries between bills is the standing fund D25
deleted.

In the database this is a null `payer_id`: no member row fronted it. In the engine the club is a
collector with no ledger entries of its own, which is why the members' entries no longer sum to
zero on their own — they fall short by exactly what the club collects.
