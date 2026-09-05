# Treasurer

Shared expenses for small groups, settled per event and recorded so nobody has to scroll a group
chat to find out who paid.

## Planning lives in Linear

The [Treasurer project](https://linear.app/gatto-lab/project/treasurer-909887ce1f41/overview) holds
the roadmap, the phase milestones and the issues. Its
[Roadmap & pending work](https://linear.app/gatto-lab/document/roadmap-and-pending-work-27f8f1a8b344)
document is the current plan.

Write plans, roadmaps and task lists there. `docs/PLAN.md` and `docs/ROADMAP.md` were deleted in
`45c5ad8` for drifting from the code while a tracker held the same information; the repo keeps
what only the repo can keep.

## Layout

- `packages/core` — the settlement engine. Pure functions over plain data, zero dependencies, no
  I/O. Everything else is packaging around it.
- `packages/db` — Drizzle schema and repository. Tests run against PGlite, so CI needs no database
  and no credentials.
- `packages/cli` — a development harness for fixtures and bootstrapping, not a product surface.
- `apps/web` — Next App Router, server components and server actions, shadcn/ui.

## Money is integer cents

`Cents` in `packages/core/src/money.ts` is the only money type. Floats never touch an amount.

Amounts cross the boundary as text and are parsed with `parseBRL` — a Brazilian keyboard types
`158,73`, and a `number` input would coerce it. Format for display with `formatBRL`.

## Decisions carry IDs

`docs/DECISIONS.md` records numbered decisions (D1, D2, …) with their reasoning. Inline comments
cite the ID where code encodes one — `// D12: empty means "everyone on the roster"`. When you
implement something a record covers, cite it the same way; when you change what a record says,
update the record in the same commit.

## Local versus production

`.env.local` is the local database and `next dev` loads it automatically. Production credentials
are pulled to `.env.production.pulled` — a name Next does not recognise — and sourced deliberately
for a command that means to reach the live club (`docs/DEPLOY.md`). Never pull production over
`.env.local`.

## Gates

Run what `.github/workflows/ci.yml` runs, in its order, before pushing: `format:check`,
`typecheck`, `lint`, `test`, `build:web`.

`pnpm e2e` is the sixth, and it is a separate CI job rather than a sixth step because it downloads
a browser and drives a real server. One test lives there — the camping trip, entered through the
screens — and it is the only thing that covers the forms between a treasurer and the numbers the
engine produces. Run it before a PR that touches a page, an action or a label.

Test concurrency is capped in `vitest.config.ts`: each fork boots its own PGlite Postgres at about
1.9 GB resident, so `maxForks: 2` is a memory ceiling, not a tuning preference. Keep any new
runner bounded the same way.

## Language

Code, comments and documentation in English. **File and directory names too** — a test about the
acampamento lives in `e2e/camping-trip.spec.ts`, and an identifier for what Membro 03 owes is
`member03`, not `membro03`.

The interface is pt-BR — labels live in `apps/web/lib/labels.ts`. The exception that proves the
rule is a domain noun with no English equivalent worth using: a _rolê_ is a rolê and a _clube_ is a
clube, in prose and in decision records alike, because renaming them to "outing" and "club" would
make the code describe something the club does not say.

Test data is interface data. A fixture types what a person would type, so `'Janta (anfitrião)'`
and `'Membro 03'` stay as they are — the assertion is that the screen shows what was entered.

## Git

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`), and the
message says why. Branch first and open a PR; `main` is protected by convention. Commits and PR
descriptions carry no agent attribution — the work is authored under the repository owner's name
alone.
