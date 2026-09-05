# Treasurer

Shared expenses for small groups — every bill collected by whoever paid it, and every share
recorded so nobody has to scroll a group chat to find out who is still open.

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

**Whoever fronted a bill collects it.** Each expense is credited to the person who paid for it and
divided among the people it was for. Events are isolated: no balance is carried from one to the
next, because the only question that matters is whether _this_ trip is settled.

**Shares round up, so a collector is never short.** A R$158,73 bill split ten ways charges R$15,88
each, and the seven centavos over go back to the person who put R$158,73 of his own money in.
Those centavos are a line of their own, never folded into a share (D1).

**Cents, never floats.** All money is integer cents end to end, and every event balances to the
cent.

**Identification codes.** Each member has a permanent two-digit code, never reused once retired.
It identifies them in the app today; a collector who links a bank account can later write it into
the cents of their own charges, so an incoming transfer names its payer whatever account it
arrived from.

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

There is no login here, and that is the local default rather than a missing feature: the panel's
gate is a shared passphrase that exists only where `PANEL_PASSPHRASE` is set, which is the
deployment and not your machine (D34).

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
