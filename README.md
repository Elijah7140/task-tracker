<img src="assets/icon.svg" width="64" height="64" alt="">

# Task Tracker

A cross-platform desktop task manager (Windows first) built with C#, .NET 10 and
[Avalonia](https://avaloniaui.net). Work is organized like a database schema:
projects → nested folders → todo items → sub-items.

See [docs/PLAN.md](docs/PLAN.md) for the full design and roadmap.

## TypeScript workspace

Use Node 26.13.0 and pnpm 12.16.1. Both were already available on the WP1
verification machine. See `.node-version` and the root `package.json` for the pins.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` opens Electron with the Vite renderer and a local RPC server. On Linux,
source `scripts/dev-env.sh` first. Set `TASKTRACKER_DB_PATH` to develop against an
isolated SQLite file.

```sh
pnpm exec vp check --deny-warnings
pnpm run build
pnpm exec playwright install chromium
pnpm exec vp test run --project core
pnpm run check:electron
```

The runtime check launches Electron main, which runs a child using its own
executable with `ELECTRON_RUN_AS_NODE=1`. Electron 45.3.4 (Node 24.22.3) passed
an in-memory SQLite FTS5 query and native `Temporal.PlainDate` arithmetic on
Linux. On headless Linux, use `xvfb-run -a pnpm run check:electron`.

On the minimal Debian 13 verification host, the Electron binary was downloaded
with `pnpm --filter @task-tracker/desktop exec install-electron`. GTK 3 and its
missing shared-library dependencies were downloaded with `apt-get download`,
extracted with `dpkg-deb -x` under `~/.local/task-tracker-gtk`, and loaded by
prepending `~/.local/task-tracker-gtk/usr/lib/x86_64-linux-gnu` to
`LD_LIBRARY_PATH` (`. scripts/dev-env.sh` does this when the folder exists).

### Package the TypeScript desktop app

```sh
pnpm run package:desktop
pnpm run test:desktop
```

The installer and unpacked executable are written to `apps/desktop/dist/package`.
Playwright runs the unpacked executable against temporary databases. On headless
Linux, run the smoke suite with `xvfb-run -a pnpm run test:desktop`.

## Build and run the .NET app

Requires the .NET 10 SDK (version pinned in `global.json`).

```sh
dotnet build
dotnet run --project src/TaskTracker.App.Desktop
dotnet test
```

On Linux, .NET needs the ICU library (`libicu`) installed.
Set `TASKTRACKER_DB_PATH` to use a different SQLite file, such as a temporary database
for a launch check. The default is `LocalApplicationData/TaskTracker/tasktracker.db`.

## Solution layout

| Project                          | Purpose                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `src/TaskTracker.Core`           | Domain model, business rules, application services. No UI, no database code.    |
| `src/TaskTracker.Infrastructure` | EF Core + SQLite persistence.                                                   |
| `src/TaskTracker.Presentation`   | ViewModels. No UI framework references, so any front end can reuse them.        |
| `src/TaskTracker.App.Desktop`    | Avalonia views and the composition root.                                        |
| `tests/*`                        | One test project per source project. UI tests use Avalonia's headless platform. |

Set `TASKTRACKER_SCREENSHOT_DIR` when running the UI tests to save rendered screenshots.

## Windows desktop smoke tests

On an interactive Windows desktop, build the solution and run the UI Automation smoke suite:

```powershell
dotnet build
$env:TASKTRACKER_SMOKE = '1'
dotnet test --project tests/TaskTracker.App.Desktop.SmokeTests
```

The smoke scenarios are skipped without `TASKTRACKER_SMOKE=1`. Failure screenshots are
saved in the smoke project's `bin/<Configuration>/net10.0-windows/Failures` directory.
