<img src="assets/icon.svg" width="64" height="64" alt="">

# Task Tracker

A cross-platform desktop task manager (Windows first) built with TypeScript,
React and Electron. Organize work into projects, nested folders, todo items and
sub-items. See [the project plan](docs/PLAN.md) for the design and roadmap.

## Develop

Use Node 26.13.0 and pnpm 12.16.1, pinned in `.node-version` and `package.json`.
Run commands from the workspace root.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` opens Electron with the Vite renderer and a local RPC server. Set
`TASKTRACKER_DB_PATH` to develop against an isolated SQLite file. The app uses
the existing Task Tracker data path by default and backs up recognized legacy
databases before adopting them. Support for the final .NET schema is tracked in WP25. For path and rollback details, see
[database continuity](docs/PLAN.md#52-database-specifics-and-continuity).

On Linux, Electron requires GTK 3. If installed user-locally under
`~/.local/task-tracker-gtk`, load it with `. scripts/dev-env.sh`.

## Build and test

```sh
pnpm exec playwright install chromium
pnpm run build
pnpm exec vp check --deny-warnings
pnpm exec vp test run
pnpm run test:server-db:electron
```

On a Linux host that needs Chromium system dependencies, use
`pnpm exec playwright install --with-deps chromium`. For a focused test run,
pass a Vitest project such as `--project core` to `pnpm exec vp test run`.
The Electron database suite runs the server's SQLite tests under the same
embedded Node runtime the desktop app ships.

The same gate is available as `pwsh ./scripts/ci-local.ps1` on Windows and
`bash scripts/ci-local.sh` on Linux. Pushes to main and pull requests use enabled
self-hosted runners. See [CI setup](docs/CI.md).

## Package and smoke-test

```sh
pnpm run package:desktop
pnpm run test:desktop
```

The installer and unpacked executable are written to `apps/desktop/dist/package`.
Playwright runs the unpacked executable against temporary databases. On headless
Linux, run the smoke suite with `xvfb-run -a pnpm run test:desktop`. The packaged
executable needs a working Chromium sandbox.

On Windows, `pwsh ./scripts/pull-build-run.ps1` closes this checkout's unpacked
app, fast-forward pulls the current branch, packages Electron and runs the
unpacked build. When installing or rebuilding, keep the database and backups
outside the install or build directory. Defaults are `%LocalAppData%/TaskTracker`
on Windows and `~/.local/share/TaskTracker` on Linux (or absolute `XDG_DATA_HOME`).

The tagged .NET release instructions are at `legacy-final:README.md`. The
Electron release pipeline, in-app updates and start-with-system are tracked in
[WP41 and WP42](docs/MIGRATION.md#wp41--installers-and-release-publishing).

## Workspace layout

| Package              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `packages/core`      | Pure domain models and business rules     |
| `packages/contracts` | Shared schemas and RPC contracts          |
| `apps/server`        | SQLite persistence, services and RPC      |
| `apps/web`           | React renderer                            |
| `apps/desktop`       | Electron shell, packaging and smoke tests |
