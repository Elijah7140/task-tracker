# Agent guide

Read [docs/PLAN.md](docs/PLAN.md) before changing anything. It defines product scope,
business rules and architecture. For the stack pivot, read the assigned work package
in [docs/MIGRATION.md](docs/MIGRATION.md).

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

## Legacy .NET (until WP24 removes it)

On Linux, load the development environment first.

```sh
. scripts/dev-env.sh
dotnet build
dotnet test
dotnet format TaskTracker.slnx --verify-no-changes
```

The legacy build must finish with zero warnings.

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

Do not commit. The project lead reviews and commits.
