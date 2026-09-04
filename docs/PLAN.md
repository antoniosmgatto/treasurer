# Treasurer — project bootstrap

**Status:** approved, in progress. Step 1 done.

## Goal

Ship an open-source web app that lets a small group settle shared expenses through **one
treasury**, and — the part nobody else does — **reconcile the incoming payments against a bank
statement automatically**.

The split arithmetic is trivial. The real problem is that after an event nobody can tell who
actually paid: amounts are identical across people, and Pix arrives from accounts under other
names. The app solves that by charging each member a slightly different amount, where the cents
encode a permanent 2-digit member code. Every line in the statement then becomes unambiguously
attributable.

Success for v0.1 = the next real event is settled on this instead of a WhatsApp thread.

## Conventions

- **Code, identifiers, comments, commits, docs: English.** `Event`, `Treasury`, `Expense`,
  `Share`, `Settled`, `Receipt`.
- **UI: internationalized, `pt-BR` as the default and only locale for now.** Labels read
  _Rolê, Caixa, Rateio, Quitado, Comprovante_. The Portuguese domain glossary becomes the translation
  table, not the variable names.
- **Money is integer cents everywhere.** Never floats.
- **README frames the project generically** — shared expenses for any small group. The moto club
  is mentioned once, as the origin story that inspired it. No club internals, no member details,
  no real amounts in the repo.
- Conventional Commits; work on branches, PRs via `/create-pr`; never straight to `main`.

## Name

**`treasurer`** — it names the role the software replaces, which is closer to the product than
"splitting" is. Verified free on npm and under the `antoniosmgatto` GitHub account; the handful
of existing repos by that name are unrelated and inactive.

- Repo: `github.com/antoniosmgatto/treasurer`
- Packages: `@treasurer/core` (engine), `@treasurer/web` (app)

---

## Steps

### 1. Create the repo

Public GitHub repo `antoniosmgatto/treasurer`, MIT, initial commit on `main` carrying the
markdown that starts the project: `README.md` (what it is, the reconciliation problem it solves,
the roadmap) and `docs/PLAN.md` (this plan), plus license and toolchain files. Roadmap items are
also filed as GitHub issues. Everything after this lands through PRs.

### 2. Scaffold the workspace

pnpm monorepo, TypeScript strict, vitest, prettier, GitHub Actions running typecheck + tests.
Two workspaces: the engine package, and the web app added in step 5.

### 3. Build the settlement engine

A zero-dependency package: money in integer cents, weighted per-expense shares, treasury as an
ordinary zero-weight participant, per-member net, and the cents-code charge derivation. Pure
functions, no I/O, no framework. This is the part that must balance to the cent, and the part
worth publishing on its own.

### 4. Lock the behaviour with tests

An anonymized end-to-end fixture (three fronted expenses, ten participants, one treasury) plus
invariants: credits always equal debits, no member is ever charged less than they owe, and every
exclusion is rendered rather than silently dropped.

_Note for step 4:_ the original hand-worked example rounds in prose — its per-head figure is the
unrounded average, while the specified floor-and-remainder rule lands a few cents differently.
Both balance to zero. The tests assert the algorithm, not the prose; worth confirming when we
get there.

### 5. Wrap it in the web app

Next.js App Router, Postgres on Neon, Drizzle. Group → Event → Expense → Shares. Access by
unguessable link, no signup — half the users will not create an account. Ends with a "copy
summary" button producing a WhatsApp-ready message.

### 6. Ship v0.1 and use it

Deploy to Vercel, run one real event through it, fix what hurts.

### 7. Then, in order

Payment collection (Pix copy-paste codes, per-member deep links) → bank statement import and
auto-matching → itemized receipt scanning → payer/receiver two-sided confirmation.

---

## Services

Everything free at this volume, no card on file.

| Need          | Choice                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Hosting       | Vercel (Hobby)                                                               |
| Database      | Neon Postgres — chosen over Supabase, whose free tier pauses idle projects   |
| ORM           | Drizzle                                                                      |
| File storage  | Cloudflare R2                                                                |
| Payment codes | Generated locally in-process; no service, no API                             |
| Bank data     | Scheduled OFX/CSV export from the bank, parsed by us — no aggregator, no KYC |
| Repo + CI     | GitHub + Actions                                                             |

Deliberately **not** used: no payment gateway, no open-banking aggregator, no auth provider. The
app never touches money; it computes, instructs, and records.

## Verification

- `pnpm typecheck && pnpm test` green; fixture and invariants hold.
- CLI settles the fixture file and prints a summary that pastes cleanly into a chat.
- CI green on the PR; README renders on GitHub.
- One real event settled end-to-end, balancing to zero.
