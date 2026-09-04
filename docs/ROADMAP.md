# From zero to POC

A high-level path. Each phase ends with something that works and can be judged — no phase is
just setup for the next one.

**The POC is done when one real event is settled end to end on this instead of a group chat.**
Not when the app is nice. When the numbers are right and somebody used it.

---

## Phase 0 — Foundations ✅

Repo, license, plan, and a TypeScript workspace that typechecks and runs tests in CI.

**Done when:** `pnpm typecheck && pnpm test` is green locally and on GitHub.

---

## Phase 1 — The math

The settlement engine, as pure functions over plain data. No database, no framework, no I/O.

- Money as integer cents, never floats
- An expense split across participants by weight, remainder absorbed by whoever fronted it
- The treasury as an ordinary zero-weight participant that never charges itself
- Every member's net position: what they owe, or what they get back
- Identification codes — turn "owes 47.51" into "pays 48.03" for member 03

**Done when:** a full worked example settles to the cent, and the invariant _total credits equal
total debits_ holds for randomly generated events.

**Why first:** it's the part that must be correct, it's testable in milliseconds, and everything
after it is packaging. If the math is wrong, nothing else matters.

---

## Phase 2 — Test harness (no UI)

A command-line tool that reads an event from a JSON file and prints the settlement plus a
ready-to-paste chat summary.

**Done when:** it settles an event you have already settled by hand, and the numbers agree.

**Why not "first usable version":** nobody hand-writes JSON for a ten-person event after a ride.
Its real job is running fixtures and catching regressions. Phase 4 is the first version anyone
will actually use. (See D5.)

---

## Phase 3 — Persistence

Postgres on Neon with Drizzle. The data model the app needs and nothing more: group, member,
event, expense, share.

**Done when:** an event created in a script survives a restart, and the engine settles it the
same way it settled the JSON file. The engine does not change — it takes the same plain objects.

---

## Phase 4 — The screens

The smallest UI that replaces the JSON file. Next.js, Portuguese labels.

- See an event: who fronted what, what each person owes
- Add an expense, pick who's in, adjust weights
- One member's own view: what they owe and why, including the lines they were excluded from

**Done when:** you can run a whole event without touching a text editor.

---

## Phase 5 — Getting it to people

The part that decides whether anyone actually uses it.

- Access by unguessable link. No signup, no install, no password
- A "copy summary" button producing a message that pastes cleanly into a group chat
- Marking an event closed

**Done when:** you send one link and people understand what they owe without you explaining it.

---

## Phase 6 — POC: run a real event

Deploy to Vercel. Use it for one actual event, start to finish, with real people and real money.
Write down every place it hurt.

**Done when:** the event balances to zero, everyone paid, and you know what to build next because
you watched it fail somewhere.

---

## Deliberately not in the POC

Named here so they don't creep in:

- **Bank statement reconciliation.** The differentiator, and the reason the identification codes
  exist from Phase 1 — but matching can be done by eye for one event. Build it once the codes
  have proven themselves in a real statement.
- **Receipt uploads and itemized invoices.**
- **Accounts, passwords, roles.** The link is the credential.
- **Payment codes and one-tap charge links.** Copy-paste the key for now.
- **Anything for a second group.** One group, hardcoded, until the first one works.

## Order of risk

If something is going to kill this project, it's one of these, roughly in the order you'll find
out:

1. **The math is subtly wrong** and someone loses money — mitigated by Phase 1 being tested to
   the cent before anything else exists.
2. **Nobody uses it** because it asks them to install or sign up — mitigated by Phase 5 being a
   plain link.
3. **The identification codes get charged a fee** by the payment provider, or arrive rounded —
   test this with a single small transfer before rolling out, not after.
