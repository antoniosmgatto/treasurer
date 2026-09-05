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

## D28 — The nota and the amount charged are two fields

A bill carries what the paperwork says and what the members are asked for, and only the second one
is ever split.

The meat receipt read R$161,47. The buyer asked for R$155,00, because he rounded in the group's
favour and absorbed the difference himself. Both numbers are true and a model holding one of them
makes somebody look wrong: store only the receipt and the group is overcharged against his wishes;
store only the charge and his generosity disappears, along with the ability to check the bill
against the photograph.

The receipt total is optional, and nothing validates one against the other. Charging more than the
nota is not automatically a mistake — a tip, or a cost the receipt never covered — and a rule that
refuses it would be wrong more often than the mistake it catches.

## D29 — A guest is a member row with no code, tied to one event

Somebody's friend comes on the trip. He eats, he owes his share, and he holds nothing afterwards:
no identification code, no place on the club's roster, no link of his own, and nobody is liable
for him. The event link is shared with him, or somebody uploads his receipt for him.

He is stored as a member row with a null `code` and a `guest_of_event_id`, rather than in a table
of his own, because `share.member_id` and `ledger_entry.member_id` are foreign keys to `member`.
A separate table would mean relaxing both, and every query that folds a ledger would have to learn
about two kinds of person.

Queries about the club filter guests out; the one query that loads an event lets in the guests of
that event and no other. `nextCode` skips null codes, so a guest never spends one of the 99 (D7).

The alternative was the weight-2 trick — the member who brought him carries a double share and
settles privately. That keeps the app simpler and pushes the exact problem this project exists to
solve back into a private conversation.

## D30 — The link preview carries no amounts and no club name

The card a rolê renders in a chat says what it is, when it was, and how many went. Nothing else.

The link is permanent and meant to be forwarded, so its preview appears in conversations nobody
here will ever see — a screenshot of the group chat, a message passed to a wife, a thread three
clubs away. What the card contains is what those people learn.

The club's name stays private because that was the first constraint stated for this project,
before any feature; amounts stay off because a total is the one number a stranger can draw
conclusions from. Anybody who taps through gets everything immediately, which is the point: the
gate is holding the link, not the preview.

Search engines are turned away from the same pages for the same reason.

## D31 — Corrections are allowed while the event is open, and never after

One rule covers the bills and the roster both: while a rolê is open, everything about it can be
fixed — the amount on a bill, who collected it, who was in on it, who came at all, and what the
event says about itself. Encerrar the rolê is the single freeze point.

Two freeze points would be harder to explain than one, and freezing on the first confirmed payment
makes the app worse than the group chat it replaces. Receipts get read wrong; a buyer remembers a
number two days late; somebody on the roster did not come; a guy turns up unannounced. All of that
happened on the trip this was built for.

**What a correction does to the ledger.** Nothing is edited — D3 holds. Correcting a published
event appends one `adjustment` per member for the difference between what the ledger recorded and
what the event now costs them. A correction that changes nobody's share appends nothing, which is
what makes it safe to run after every edit.

**What it does to somebody who already paid.** Their payment is not wrong; the charge moved
underneath it. They are flagged **conferir** with the gap named and its direction stated — money
still to come in, or money the club is holding that is not its own. A fronter who was
under-reimbursed and a debtor who overpaid are the same fact, so the flag reads off the balance
rather than off the person's role. The member's own page says the same thing: they should not hear
it from somebody else first.

The alternative — recording the payment as settled and letting the balance drift — is exactly the
failure the project exists to remove, a number that quietly went wrong with nobody told.

**Where the description does not go.** It is free text, so it can name the club or quote an
amount. It stays off the link preview, which carries name, date and headcount and nothing else
(D30).

## D32 — The rolê's link replaces the member's own. D11 is superseded

Every member used to hold a permanent personal link, `/e/<token>`, that landed them on their own
amount. It is gone, along with the `member.read_token` column behind it.

What replaced it is one link per rolê (D30, Q12): the group chat gets a single URL, everybody who
opens it sees the whole table, and tapping your own name gets you what the personal link used to
give you — with the exclusions, the payments per collector and the exact amount to transfer.

D11's reasoning was that a member should not have to find their name in a list. That held while the
list was the club's fifteen people and the link was the only way in. It stopped holding once the
event page existed: the list is now the ten who came, the name is one tap, and the public table is
doing work the private link could never do — it is what lets somebody notice they are the last one
still open, which is the entire mechanism replacing the group chat.

Fifteen permanent credentials to distribute, none of them revocable without reissuing the whole
roster, bought nothing that one shareable link does not.

**The column is dropped rather than left behind.** A credential nothing checks is a liability, not
a record — D19's "never destroy" is about facts the club may want back, and a token is not one.
Any `/e/<token>` still in somebody's messages stops resolving, which is the intended outcome.

The group's own `read_token` survives for now: nothing reads it either, and it comes out with the
rest of D9 when accounts land.

## D33 — Several rolês open at once. D4 is superseded

D4 let a group hold exactly one open event, enforced by a partial unique index rather than by
convention. Its reason was reconciliation: the identification code lives in the centavos and
identifies the _member_, so an incoming R$48,03 from member 03 says who paid and not what for.
With two rolês open, that is genuinely ambiguous.

It still is. What changed is the price. A club that rides monthly has the churrasco being
organised while the acampamento is still collecting, and D4 made the second one wait on the
first — not on the money, on somebody remembering to press _encerrar_. The constraint defends a
bank connection that does not exist and will not for several phases, and it charges for that
defence in the only currency this app has, which is whether people use it.

Nothing today is ambiguous, because nothing today reads a statement. Payments are marked by hand
against a named rolê (D13) and the entry carries that `event_id`. The ambiguity arrives with the
import, and it arrives there as a matching problem — D4's own closing line said as much and named
oldest-charge-first as the rule. It belongs where the information to resolve it is.

**What this does not change.** Balances were already per event and never per club (D31): both
`positionsIn` and `recomputeCharges` are scoped by `event_id`, so two open rolês cannot reach into
one another's arithmetic. What could not survive is `openEventFor` — a function whose entire
meaning was "the open one", which would now hand an arbitrary row to a caller that believes
otherwise. The dangerous caller was the panel's recompute, which compared that row's id against
the event being corrected: with several open, a correction to any rolê but the first would have
silently skipped the recompute and left somebody's charge quietly wrong, which is precisely what
D31 exists to prevent. It is replaced by a lookup of the named event, scoped to its group.
`lastEventFor` and `ensureOpenEvent` are deleted alongside it.

**What it does to the panel.** `/painel` becomes a list of rolês and nothing else; the workspace
moves to `/painel/roles/<id>`, which already existed as the read-only view of a closed one. One
rolê is one URL, which is what lets two be open in two tabs — and closing stops being the thing
that lets the next one exist. It is now only what stops the corrections.
