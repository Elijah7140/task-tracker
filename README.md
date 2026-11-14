<img src="assets/icon.svg" width="64" height="64" alt="">

# Task Tracker

A cross-platform desktop task manager (Windows first) built with C#, .NET 10 and
[Avalonia](https://avaloniaui.net). Work is organized like a database schema:
projects → nested folders → todo items → sub-items.

See [docs/PLAN.md](docs/PLAN.md) for the full design and roadmap.

## Build and run

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

| Project | Purpose |
|---------|---------|
| `src/TaskTracker.Core` | Domain model, business rules, application services. No UI, no database code. |
| `src/TaskTracker.Infrastructure` | EF Core + SQLite persistence. |
| `src/TaskTracker.Presentation` | ViewModels. No UI framework references, so any front end can reuse them. |
| `src/TaskTracker.App.Desktop` | Avalonia views and the composition root. |
| `tests/*` | One test project per source project. UI tests use Avalonia's headless platform. |

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
