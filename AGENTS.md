# Agent guide

Read [docs/PLAN.md](docs/PLAN.md) before changing anything. It defines product scope,
business rules and architecture. For the stack pivot, read the assigned work package
in [docs/MIGRATION.md](docs/MIGRATION.md).

## Roles

- **Owner** sets scope, makes product decisions and reviews the app hands-on (§11.1).
- **Project lead** plans work, briefs delegates, reviews their changes and owns PR
  integration. Review and commit Linux snapshots from a Linux run.
- **Subagents and delegates** implement, test and report on the assigned brief.
  Commit when the brief requests commits. The project lead handles branch pushes
  and merges unless the owner delegates those explicitly.

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
Linux and Windows runners for every push and pull request ([docs/CI.md](docs/CI.md)).
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

Review baselines on their respective operating systems. Windows baselines come from
the `windows-latest` CI run's `browser-screenshot-diffs-windows` artifact, because
DirectWrite output differs between Windows builds. For Linux changes the
project lead reviews the `browser-screenshot-diffs-linux` CI artifact or the
received images from a Linux test run.

## Subagents

Start every subagent with full access (for example, `runtimeMode: "full-access"`
in T3 `delegate_task`), including subagents on linked machines. The owner does
not want to approve subagent permission requests.
