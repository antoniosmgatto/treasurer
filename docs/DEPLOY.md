# Deploying

Vercel for the app, Neon for the database. Both free at this volume, no card on file.

The app needs exactly one secret: `DATABASE_URL`. There is no signup, no auth provider, no
object storage yet — access is by unguessable link, so there is nothing else to configure.

---

## 1. The Vercel project

Import the repository at [vercel.com/new](https://vercel.com/new). Before deploying, click
**Edit** next to Root Directory and set these — this is a monorepo and the detected settings will
be wrong:

| Setting          | Value                              |
| ---------------- | ---------------------------------- |
| Root Directory   | `apps/web`                         |
| Framework Preset | Next.js (detected)                 |
| Build Command    | override → `pnpm -w run build:web` |
| Output Directory | leave alone — Next.js sets it      |
| Install Command  | leave alone — `pnpm install`       |

Under **Root Directory**, check that _Include source files outside of the Root Directory in the
Build Step_ is on. It is the default, and without it the build cannot see `packages/` at all.

The build command is the part worth understanding. The app imports `@treasurer/core` and
`@treasurer/db` as workspace packages and consumes their compiled output, so those have to be
built before the app is. `-w` runs the script in the workspace root, where `build:web` compiles
the packages and then the app, in that order. Vercel's own default — `next build` alone — would
build the app against packages that were never compiled.

`-w` only resolves correctly because `apps/web` is a plain workspace member. It used to carry its
own `pnpm-workspace.yaml`, which made it a workspace root in its own right and turned any `-w`
script into one that invoked itself.

Deploy. The first build succeeds and the app then fails to start, because there is no database
yet. That is the next step, and the failure is deliberate — see the note at the end.

## 2. The database

Neon is provisioned from inside Vercel, so there is no second account to create and no connection
string to copy by hand.

In the project, open the **Storage** tab, choose **Neon** from the Marketplace, and create a
database. Pick the free plan and a region; `aws-us-east-1` is the default and is fine from Brazil.
Tick all three environments — Development, Preview and Production — when asked which get the
variables.

The integration sets `DATABASE_URL` on the project automatically, already pointing at the
**pooled** endpoint, which is the one serverless functions need. It also sets
`DATABASE_URL_UNPOOLED` and a handful of `PG*` variables that this app ignores.

Redeploy once the variables exist, from **Deployments → ⋯ → Redeploy**.

Billing for a database created this way runs through your Vercel invoice rather than a separate
Neon account. If you would rather keep them apart, create the project at
[neon.tech](https://neon.tech) instead, copy the pooled connection string — the host contains
`-pooler` — and add it to Vercel yourself as `DATABASE_URL` for all three environments.

## 3. The schema

Migrations run from your machine against the hosted database. Pull the connection string that
Vercel now holds:

```sh
npx vercel link
npx vercel env pull .env.local --environment=production
```

`--environment=production` is not optional. Without it the CLI pulls the Development
environment, which will not have the database variables, and you end up with a file holding
little more than `VERCEL_OIDC_TOKEN`. Check before going further:

```sh
grep -c '^DATABASE_URL=' .env.local   # must print 1
```

`.env.local` is gitignored. Load it into the shell once, and both this command and the seed in the
next step will use it:

```sh
set -a; source .env.local; set +a
pnpm cli migrate
```

It prints `Migrando o banco remoto…`. If it says `local` instead, the variable did not reach the
process and it just migrated the PGlite file in `.data/`.

## 4. Create the club

Seeding writes real names, so it is a local command against the production database rather than
anything committed. Copy `examples/club.json`, fill in the real roster, and keep it out of git —
`*.private.json` is already ignored:

```sh
cp examples/club.json club.private.json
$EDITOR club.private.json
pnpm cli seed club.private.json
```

It prints the treasurer link and one link per member, as paths:

```
Link do tesoureiro (guarde, dá acesso de escrita):
  /acesso/xxxxxxxx

Links dos membros:
  01  Fulano                /e/yyyyyyyy
```

Prepend your deployment's domain to each. The treasurer link is the write link — opening it
once sets a cookie and redirects to a clean URL, so it should be opened by the treasurer and
nobody else. Member links are read-only and safe to send individually.

Seeding runs migrations itself, so step 2 is only strictly needed when you are updating the
schema of a database that already exists.

## Notes

**The database is not a secret store.** Member Pix keys are deliberately not persisted (D8).
Nothing in the database is worth more than the links themselves.

**Rounding surplus accrues to the treasury.** Roughly R$4,44 on a ten-person event, and it is
systematically uneven — the member with the highest code always pays a little more (D1). Tell
the group; it is small, but it is not nothing and it is not random.

**A deployment refuses to start without `DATABASE_URL`.** Locally, no connection string means a
Postgres in a file under `.data/`. On Vercel that fallback would write to a filesystem that is
thrown away between invocations, so the data would appear to save and then vanish — which is why
`connect()` throws instead when `VERCEL` or `NODE_ENV=production` is set. A deploy that fails
loudly beats a club that loses its ledger.

**PGlite stays the local default.** With no `DATABASE_URL`, everything falls back to a Postgres
in a file under `.data/`, so development and tests need no service and no credentials. Only
deployment needs Neon.

**Free-tier caveat.** Neon suspends a database after five minutes idle and wakes it on the next
query. The first request after a quiet period takes a second or two. For a club that rides
monthly this is the right trade; it is also why Supabase was rejected, since its free tier
pauses projects outright rather than sleeping them.
