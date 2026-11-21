# Agent guide

Read [docs/PLAN.md](docs/PLAN.md) before changing anything. It defines product scope,
business rules and architecture. For the stack pivot, read the assigned work package
in [docs/MIGRATION.md](docs/MIGRATION.md).

## Roles

- **Owner** sets scope, makes product decisions and reviews the app hands-on (§11.1).
- **Project lead** plans work, briefs delegates, reviews their changes and lands
  them on `main` (see Shipping changes). Review and commit Linux snapshots from a
  Linux run.
- **Subagents and delegates** implement, test, commit and report on the assigned
  brief. Commit each working step as you go. The project lead pushes and merges
  unless the brief hands that to you.

## Shipping changes

Shipping beats polishing. Commit early and often, and get finished work onto
`main` the same session.

- **Small change** (docs, a bug fix, a contained feature or refactor): run the
  static check and the tests for what you touched, then commit and push straight
  to `main`. CI still runs on the push; fix forward if it goes red.
- **Big change**: open a PR and merge once CI is green. A change is big when it
  touches database schema or migrations, packaging, release or the updater, or
  shared dependency versions, or when it spans several packages at once.

When unsure, treat it as small. A red CI run on `main` is cheap to fix forward.

## Starting a session

Before creating a branch or worktree from `main`, bring `main` up to date with
the remote. Run `git fetch origin` and branch from `origin/main`, or fast-forward
the local `main` first (`git pull --ff-only`). If your session already started on
a branch, rebase it onto the freshly fetched `origin/main` before making changes.
Never branch from a stale local `main`.

## Commands

Use the Node 26 and pnpm 12 versions pinned in `.node-version` and `package.json`.
Run from the workspace root.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm exec vp check --deny-warnings
pnpm exec playwright install chromium
pnpm exec vp test run
pnpm exec vp test run --project core
pnpm run check:electron
```

Run the static check before finishing. Build and checks must have zero warnings.
Both `vp check --help` and `vp lint --help` list `--deny-warnings`. On headless
Linux, run the Electron runtime check with `xvfb-run -a` after building.
Once desktop packaging lands, run `pnpm run package:desktop` before
`pnpm run test:desktop`.

On Linux, source `scripts/dev-env.sh` for user-local GTK. CI runs on GitHub-hosted
Linux and Windows runners for every pull request and push to `main`
([docs/CI.md](docs/CI.md)).
The local gate in that file is an optional pre-push check.

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

When a migration rebuilds `TodoItem` after FTS lands, recreate the search triggers
and reconcile `TodoItemSearchRow` and `TodoItemSearch`. Verify the resulting schema
and index behavior in SQLite tests (§7.2).

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

Never let a test open the owner's real database. On a machine where the owner uses
the app (such as `dev-win01`), hand-check installed builds only under a separate OS
user account. Processes Windows starts itself (the updater relaunch, toast
activation, Run-key startup) drop `TASKTRACKER_DB_PATH` and other test variables,
so they fall back to the default data folder. Back that folder up before any hand
check and confirm it is byte-identical afterwards.

Screenshot baselines are Linux-only (PLAN §11.1, decision 11). Commit only
`*-linux.png` images, reviewed from a Linux test run or the
`browser-screenshot-diffs-linux-*` CI artifacts. On Windows the browser tests run
every assertion except the screenshot comparison, and the packaged smoke covers the
real desktop. To see how changed screens look on Windows, run the **Windows
screenshots** workflow on the branch and review its `windows-screenshots` artifact.
The owner's hands-on review on Windows 11 is the final visual check.

## Subagents

Start every subagent with full access (for example, `runtimeMode: "full-access"`
in T3 `delegate_task`), including subagents on linked machines. The owner does
not want to approve subagent permission requests.
