# Treasurer

Shared expenses for small groups — settled through a single treasury, and reconciled against the
bank statement automatically.

> Status: early. The settlement engine is being built first; the web app follows.

## The problem

Splitting a bill is arithmetic. Knowing **who actually paid** is the hard part.

Any group that shares costs regularly — a club, a trip, a house, a team — runs into the same
three failures, and they all happen after the money is supposed to move:

1. **Several people collect for the same event.** One fronts the food, another reimburses the
   host. Two payment keys, two mental ledgers, nobody knows who is fully settled.
2. **"I paid" is not verifiable.** Some people post a receipt in the group chat, some don't, and
   the thread scrolls away.
3. **Payers are unidentifiable in the bank statement.** Everyone owes the same amount, so every
   incoming line looks alike — and transfers routinely arrive from a partner's or a parent's
   account under a different name.

Treasurer is built around problem 3, because that is the one no expense splitter solves.

## How it works

**One treasury, hub and spoke.** All money flows through a single account. Members pay the
treasury; the treasury reimburses whoever fronted money. No n-to-n transfer optimization — that
web of little debts is the mess being replaced. The treasury itself is just an ordinary member
row that never charges itself, and its running balance _is_ the group's fund.

**Identification codes in the cents.** Each member has a permanent two-digit code. Their charge
is the per-head amount rounded up to the whole unit, with their code as the cents:

```
per-head 15.87  →  member 03 is charged 16.03
                   member 11 is charged 16.11
```

Every incoming line in the statement is now unambiguously attributable, no matter whose account
it came from. The few cents of surplus land in the treasury.

**Cents, never floats.** All money is integer cents end to end. Shares are floored per member
and the remainder is absorbed by the person who fronted the expense, so every event balances to
the cent.

**Weights per expense.** Default 1. Zero excludes someone who brought their own. Two covers a
guest. The same field handles half portions — and exclusions are always shown, never silently
dropped, because a missing line reads as a mistake.

## Try it

```sh
pnpm install
pnpm cli examples/acampamento.json
```

Prints the per-member table, the amount to ask each person for, and a summary ready to paste
into a group chat. `--member m03` shows one person's own breakdown, rounding included.

For the web app, `pnpm dev` runs it against a Postgres in a local file — no database to install
and no connection string to set. That file is single-writer, though, so the dev server and the CLI
cannot both use it at once. To run them together, start a real one:

```sh
docker compose up -d
cp .env.example .env.local && set -a && source .env.local && set +a
pnpm cli seed examples/club.json   # prints the links to open
pnpm dev
```

`pnpm cli links` reprints those links whenever you lose them, and `pnpm cli links --rotate`
reissues the treasurer's — the write link is a password that happens to be a URL, so pasting it
somewhere public should cost a new link rather than a new club.

To put it online, see [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Direction

v0.1 settles an event end to end. After that, in order: collection (payment codes and one-tap
charge messages), then **reconciliation** — importing the bank statement and auto-matching on
code plus amount, which is the thing the identification codes exist for and the one no expense
splitter does. Itemized receipts and a payer/receiver trust layer come after.

Planning and open work are tracked outside the repo; [`docs/DECISIONS.md`](docs/DECISIONS.md)
records why the design is the way it is.

## Stack

TypeScript throughout. A zero-dependency settlement engine (`@treasurer/core`) with a Next.js
app on top, Postgres, and object storage for receipts. Runs comfortably in free tiers.

The app never touches money. It computes, instructs, and records — no payment gateway, no
open-banking aggregator, no custody.

## Conventions

Code, comments and docs are in English. The interface is internationalized with **pt-BR as the
default locale**.

## Origin

Born from the accounting of a motorcycle club that splits costs after every ride, where the
group chat had stopped being a good enough ledger. Nothing in this repository is specific to it.

## License

MIT
