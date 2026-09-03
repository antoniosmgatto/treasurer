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

## Roadmap

| Version | Scope                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------- |
| v0.1    | Group, events, expenses, shares, per-member settlement, copy-to-chat summary, access by unguessable link |
| v0.2    | Collection — payment codes per member and one-tap personalized charge messages                           |
| v0.3    | **Reconciliation** — import the bank statement, auto-match on code + amount, queue the rest              |
| v0.4    | Itemized receipts — scan the invoice, tag participants per item instead of per receipt                   |
| v0.5    | Trust layer — member declares payment, uploads proof, treasurer confirms                                 |

See [`docs/PLAN.md`](docs/PLAN.md) for the full plan.

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
