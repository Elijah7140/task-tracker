# Agent guide

Task Tracker is a local desktop task manager in one pnpm workspace: pure rules in
`packages/core`, wire contracts in `packages/contracts`, an Effect server over
SQLite in `apps/server`, a React renderer in `apps/web` and an Electron shell in
`apps/desktop`.

## Standing authorization

The owner starts agents and walks away. This file is the owner's standing approval
to commit, push to `main`, open pull requests and merge them once CI is green, as
Shipping changes describes. Finish the task and land it without asking first.

Three things wait for the owner:

- A product decision the plan does not settle (PLAN §12 lists the ones made).
- Publishing a release, which is pushing a `v*` tag, unless the task says to
  release. A release dry run needs no approval.
- Anything you cannot restore: rewriting or force-pushing `main`, deleting
  unmerged work, touching the owner's data.

When one of these blocks part of the task, finish everything that does not depend
on it and put the question first in your final report.

## Roles

- **Owner** sets scope, makes product decisions and reviews the app hands-on
  after changes land.
- **Project lead** is the agent in a thread the owner started. It plans the work,
  does or delegates it, reviews delegated changes and lands the result on `main`.
- **Delegates** (subagents and child threads) implement, test, commit and report
  on their brief. The project lead pushes and merges unless the brief hands that
  over.

## Reading

[docs/PLAN.md](docs/PLAN.md) defines product scope, business rules and
architecture. It is about 2,000 lines, so read the sections your task touches.
A `§` in this guide and in code comments is a PLAN section.

| Task touches                                  | Read                         |
| --------------------------------------------- | ---------------------------- |
| Anything                                      | §4 Architecture              |
| Data, migrations, deletion, dates and times   | §5                           |
| Completion, urgency, ordering, settings       | §6                           |
| A feature (search, undo, reminders, tickets…) | Its §7 subsection            |
| Screens, menus, keyboard                      | §8                           |
| Tests                                         | §11.1                        |
| A write the user can undo                     | [docs/UNDO.md](docs/UNDO.md) |
| CI jobs, screenshot baselines                 | [docs/CI.md](docs/CI.md)     |

[docs/MIGRATION.md](docs/MIGRATION.md) and [docs/PARITY.md](docs/PARITY.md) record
the finished port from the legacy .NET app. Read them only to trace why something
was built the way it was.

## Shipping changes

Shipping beats polishing. Commit each working step and land finished work on
`main` in the same session.

- **Small change** (docs, a bug fix, a contained feature or refactor): run the
  static check and the tests for what you touched, then commit and push straight
  to `main`.
- **Big change**: open a pull request and merge it once CI is green. A change is
  big when it touches database schema or migrations, packaging, release or the
  updater, or shared dependency versions, or when it spans several packages.

When unsure, treat it as small.

The work is done when CI is green on `main` for your commit:

- After a push to `main` or a merge, wait for that commit's CI run, about six
  minutes: `gh run list --commit <sha> --workflow CI`, then
  `gh run watch <run-id> --exit-status`. If it is red, fix forward with a new
  commit and wait again.
- A push that changes only Markdown starts no CI run, so there is nothing to
  wait for.
- When `git push` is rejected because `main` moved, run
  `git pull --rebase origin main`, repeat the static check and push again.

## Starting a session

Run `git fetch origin` and branch from `origin/main`. If the session started on a
branch, rebase it onto the fetched `origin/main` before changing anything.

## Commands

The README lists the commands under
[Build and test](README.md#build-and-test) and
[Package and smoke-test](README.md#package-and-smoke-test). Run them from the
workspace root with the Node and pnpm versions pinned in `.node-version` and
`package.json`. What the README does not make obvious:

- Build before the static check: `pnpm run build`, then
  `pnpm exec vp check --deny-warnings`. Packages resolve each other through
  `dist`, so the check reports hundreds of errors on an unbuilt tree.
  `pnpm exec vp check --fix` applies the formatter.
- Build and static check must finish with zero warnings. Run the static check
  before finishing.
- `pnpm run test:node` leaves out the server's SQLite and RPC suites. They run
  under Electron, the runtime that ships: `pnpm run test:server-db:electron`.
- On Linux, `. scripts/dev-env.sh` loads the user-local GTK that Electron needs.
  On a headless machine, prefix Electron and packaged runs with `xvfb-run -a`.
- The packaged smoke needs a fresh package: `pnpm run package:desktop`, then
  `pnpm run test:desktop`.

## Code

- Follow §4. Server depends on Core and contracts. Web depends on contracts and
  never imports Core or server. Core is pure and imports nothing from the workspace.
  Business rules live in Core and server.
- Use strict TypeScript and ESM. Keep shared dependency versions in the pnpm catalog.
- Use Oxfmt and Oxlint. Keep one exported concept per file where sensible. Write
  short, single-purpose functions (aim for about 25 lines), one statement per line
  and intention-revealing names. Use one- or two-letter names only for loop indices
  and trivial callback parameters. Prefer a named helper over deep nesting.
- Document exported concepts and non-obvious behavior with JSDoc. Comments should
  explain intent or constraints.
- Take current time and timers from Effect Clock. Resolve the OS zone at the server
  composition root and pass time and zones explicitly (§5.4). Outside that root,
  do not use `Date.now()`, `new Date()`, `Temporal.Now` or
  `Intl...resolvedOptions().timeZone`.

## Application operations

Compose long-lived services with Effect Layers. Each public database operation
owns one SQL transaction. Repositories share it from validation through every
resulting write. Commit once on success and roll back the entire write on failure
or interruption. Read persisted results through a fresh operation in tests.
Treat confirmation as a new request and revalidate before applying it.

An undoable write names the rows it can change before it writes
([docs/UNDO.md](docs/UNDO.md)). Keep those sources as narrow as the write: a
source that selects a whole table is read twice on every call.

When a migration rebuilds `TodoItem`, recreate the search triggers and reconcile
`TodoItemSearchRow` and `TodoItemSearch`. Verify the resulting schema and index
behavior in SQLite tests (§7.2).

## Tests

- Use Vitest and `@effect/vitest`. Keep one test file per unit under test, mirroring
  the source layout. Use sentence test names and separate arrange, act and assert
  with blank lines.
- Test database behavior against real `node:sqlite`. Use an isolated in-memory
  connection by default and temporary files for backup, reopen and EF fixture tests.
- Follow §11.1. Cover new shortcuts, gestures and dialogs with simulated browser
  input. Give interactive controls accessible names and stable `data-testid`
  identifiers. Review screenshot baselines for new or changed screens. Add a
  regression test for each bug found by hand.
- Desktop suites that launch the packaged app go in `apps/desktop/test/packaged`.
  Every other desktop suite is a unit suite and runs with `test:node`.

Never let a test open the owner's real database. On a machine where the owner uses
the app (such as `dev-win01`), hand-check installed builds only under a separate OS
user account. Processes Windows starts itself (the updater relaunch, toast
activation, Run-key startup) drop `TASKTRACKER_DB_PATH` and other test variables,
so they fall back to the default data folder. Back that folder up before any hand
check and confirm it is byte-identical afterwards.

Screenshot baselines are Linux-only (§11.1, decision 11). Commit only
`*-linux.png` images, reviewed from a Linux test run or the
`browser-screenshot-diffs-linux-*` CI artifacts. On Windows the browser tests run
every assertion except the screenshot comparison, and the packaged smoke covers the
real desktop. To see how changed screens look on Windows, run the **Windows
screenshots** workflow on the branch and review its `windows-screenshots` artifact.
The owner's hands-on review on Windows 11 is the final visual check.

## Releases

A release is a pushed `v*` tag on a commit whose CI is green
([Cut a release](README.md#cut-a-release)). Rehearse it first:
`gh workflow run release.yml -f version=vX.Y.Z` packages and smoke-tests Windows,
Linux and macOS and verifies the files without publishing. CI never builds the
macOS package, so the dry run is the only check of it before the tag.

## Subagents

Start every subagent with full access (for example, `runtimeMode: "full-access"`
in T3 `delegate_task`), including subagents on linked machines. The owner does
not want to approve subagent permission requests.
