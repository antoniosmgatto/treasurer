# Deploying

Vercel for the app, Neon for the database. Both free at this volume, no card on file.

The app needs exactly one secret: `DATABASE_URL`. There is no signup, no auth provider, no
object storage yet — access is by unguessable link, so there is nothing else to configure.

---

## 1. The database

Create a project at [neon.tech](https://neon.tech). Any region works; `aws-us-east-1` is the
default and is fine from Brazil.

From the dashboard, copy the **pooled** connection string — the host contains `-pooler`:

```
postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Take the pooled one, not the direct one. Serverless functions open a connection per invocation
and the direct endpoint will run out of them.

## 2. The schema

Apply migrations from your machine, pointing at Neon. Run it from the repository root:

```sh
DATABASE_URL='postgresql://…-pooler…' pnpm cli migrate
```

It prints `Migrando o banco remoto…` — if it says `local` instead, the variable did not reach
the process and it just migrated the PGlite file in `.data/`. Quote the string; the connection
string contains characters your shell will otherwise interpret.

## 3. The Vercel project

Import the repository at [vercel.com/new](https://vercel.com/new), then override the defaults —
this is a monorepo and the detected settings will be wrong:

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

Add the environment variable, for all three environments:

```
DATABASE_URL = postgresql://…-pooler…
```

Deploy.

## 4. Create the club

Seeding writes real names, so it is a local command against the production database rather than
anything committed. Copy `examples/club.json`, fill in the real roster, and keep it out of git —
`*.private.json` is already ignored:

```sh
cp examples/club.json club.private.json
$EDITOR club.private.json
DATABASE_URL='postgresql://…-pooler…' pnpm cli seed club.private.json
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

**PGlite stays the local default.** With no `DATABASE_URL`, everything falls back to a Postgres
in a file under `.data/`, so development and tests need no service and no credentials. Only
deployment needs Neon.

**Free-tier caveat.** Neon suspends a database after five minutes idle and wakes it on the next
query. The first request after a quiet period takes a second or two. For a club that rides
monthly this is the right trade; it is also why Supabase was rejected, since its free tier
pauses projects outright rather than sleeping them.
