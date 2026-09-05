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

Run what `.github/workflows/ci.yml` runs, in its order, before pushing.

Test concurrency is capped in `vitest.config.ts`: each fork boots its own PGlite Postgres at about
1.9 GB resident, so `maxForks: 2` is a memory ceiling, not a tuning preference. Keep any new
runner bounded the same way.

## Language

Code, comments and documentation in English. The interface is pt-BR — labels live in
`apps/web/lib/labels.ts`.

## Git

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`), and the
message says why. Branch first and open a PR; `main` is protected by convention. Commits and PR
descriptions carry no agent attribution — the work is authored under the repository owner's name
alone.
