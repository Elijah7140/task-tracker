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

## Install

Download the file for your system from the
[latest release](https://github.com/Elijah7140/task-tracker/releases/latest). The builds are not
code-signed yet, so Windows and macOS warn the first time you open them; the steps below get past that.

- **Windows (x64):** run `TaskTrackerApp-win-Setup.exe`. It installs for your user only (no admin
  rights) into `%LocalAppData%\TaskTrackerApp` and adds Start-menu and desktop shortcuts.
  If SmartScreen shows "Windows protected your PC", choose **More info → Run anyway**.
  `TaskTrackerApp-win-Portable.zip` is the same app without an installer.
- **Linux (x64):** download the `.AppImage` file, make it executable and run it:

  ```sh
  chmod +x TaskTrackerApp.AppImage
  ./TaskTrackerApp.AppImage
  ```

  If it reports a FUSE error, install your distribution's `libfuse2` package.
- **macOS (Apple silicon):** open the `osx` `.pkg` installer, or unzip the `osx` portable zip and move
  **Task Tracker** to Applications. Gatekeeper blocks unsigned apps on first launch: **right-click (or
  Control-click) the app → Open → Open**. On macOS 15 or later, instead open the app once, then choose
  **System Settings → Privacy & Security → Open Anyway**.

**The default data location is preserved.** The database and its backups live in `LocalApplicationData/TaskTracker`
(`%LocalAppData%\TaskTracker` on Windows, `~/.local/share/TaskTracker` on Linux), outside the install
folder. Installing, updating and uninstalling preserve that location, and a reinstall picks it up
again. A custom `TASKTRACKER_DB_PATH` inside the install folder can be lost during install, update, or uninstall.

**Updates:** App Settings → **Check for updates**. If a newer release exists, **Download and restart**
downloads it. Use **Restart to update** when ready. If you keep working, Velopack applies the
downloaded update the next time Task Tracker starts. The app checks only on request, in installed
builds, and considers stable releases only. Auto-update requires releases published to a public
GitHub repository. The default repository is currently private. Making it public or choosing a
separate public release repository is an open owner decision.

**Start with the system:** App Settings → **Start Task Tracker when I sign in** (installed builds on
Windows and Linux). On Windows it adds a `TaskTracker` value under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. On Linux it writes
`~/.config/autostart/task-tracker.desktop` (or under `$XDG_CONFIG_HOME`).

**Uninstall:**
- **Windows:** Settings → Apps → Installed apps → Task Tracker → Uninstall. This also removes the
  start-with-system entry.
- **Linux:** delete the AppImage, and `~/.config/autostart/task-tracker.desktop` if you turned on
  Start with the system.
- **macOS:** move the app to the Trash.

## Packaging and releases

[Velopack](https://velopack.io) builds the installers (§7.13 in the plan). Its `vpk` CLI is a local
dotnet tool pinned in `.config/dotnet-tools.json`; the scripts restore it.

```sh
./scripts/pack.ps1                  # Windows: win-x64, version from Directory.Build.props
./scripts/pack.ps1 -Version 0.2.0
./scripts/pack.ps1 -UpdateFeedUrl https://github.com/example/task-tracker-releases
bash scripts/pack.sh                # Linux: linux-x64; macOS: osx-arm64
bash scripts/pack.sh linux-x64 0.2.0
bash scripts/pack.sh linux-x64 0.2.0 https://github.com/example/task-tracker-releases
```

Each script runs from the repository root regardless of the caller's directory. It publishes a
self-contained, untrimmed build to `artifacts/publish/<runtime>` and writes the
release files to `artifacts/releases/<runtime>`. `artifacts/` is git-ignored. Velopack packs only for the
OS it runs on. The pack id is `TaskTrackerApp`, not `TaskTracker`: on Windows, Velopack deletes
`%LocalAppData%\<packId>` on uninstall, and that must never be the data folder.

The desktop build embeds the `TaskTrackerUpdateFeedUrl` MSBuild property from `Directory.Build.props`.
The examples above override it at pack time. Tagged builds use the GitHub Actions repository
variable `TASKTRACKER_UPDATE_FEED_URL` when set. The workflow publishes to the repository that runs
it. If you configure a separate public feed, publish the release assets to that repository too.

On every pull request and push to `main`, the CI `package` job packs for Windows and Linux and uploads
the result as the `package-win-x64` and `package-linux-x64` workflow artifacts. It never publishes a
release.

**Cutting a release:** when `main` is green, tag it and push the tag:

```sh
git tag v0.2.0
git push origin v0.2.0
```

`.github/workflows/release.yml` takes the version from the tag (`v0.2.0` → `0.2.0`), packs win-x64,
linux-x64 and osx-arm64, and uploads all three feeds to a draft before publishing the GitHub Release.
A rerun rebuilds an incomplete draft. A version containing a hyphen, such as `0.2.0-rc.1`, is
published as a GitHub prerelease and skipped by the app's stable update check.
`<Version>` in `Directory.Build.props` is only the version of local builds.

### Manual install, update and uninstall checklist (Windows)

Run this on a Windows machine before signing off a release. Back up `%LocalAppData%\TaskTracker` first.

1. **Install:** run `TaskTrackerApp-win-Setup.exe` from the release (or the `package-win-x64` CI
   artifact). Get past SmartScreen with **More info → Run anyway**. The app opens, a **Task Tracker**
   Start-menu shortcut exists, and the app is in `%LocalAppData%\TaskTrackerApp`.
2. **Existing data:** projects created earlier, for example with a build run from source, appear.
3. **About:** App Settings shows "Task Tracker version X" for the installed version.
4. **Up to date:** on the newest release, **Check for updates** says "Task Tracker is up to date."
5. **Offline:** with the network off, **Check for updates** shows the plain "Couldn't check" message.
6. **Start with the system:** tick **Start Task Tracker when I sign in** and save. Under
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, the `TaskTracker` value is the quoted path to
   `%LocalAppData%\TaskTrackerApp\current\TaskTracker.App.Desktop.exe`. Sign out and in: the app starts.
   Untick and save: the value is gone.
7. **Update:** with an older release installed and a newer stable one published to the configured
   public feed, **Check for updates** shows "Version Y is available." Choose **Download**, wait for
   "Ready to restart," then choose **Restart to update**. About shows Y after the app reopens,
   the data is intact, and a ticked start-with-system entry still works.
8. **Uninstall:** Settings → Apps → Task Tracker → Uninstall. `%LocalAppData%\TaskTrackerApp` and the
   `Run` value are gone. `%LocalAppData%\TaskTracker\tasktracker.db` and its backups are still there.
9. **Reinstall:** install again; the data is back. The start-with-system box may still be ticked from
   before. Untick, save, tick and save to recreate the entry.

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

### Test-only file picker hook

The import/export smoke scenario cannot drive the native Windows file dialog reliably, so the app has a
test-only hook: when **both** `TASKTRACKER_TEST_FILE_PATH` (a file path) **and** `TASKTRACKER_SMOKE=1` are set,
`CompositionRoot` replaces the file dialogs with a picker that answers every save and open with that one path
and shows nothing. With either variable missing the real dialogs are used, so a normal run can never silently
overwrite or read that file. Do not set these variables outside the smoke tests.
