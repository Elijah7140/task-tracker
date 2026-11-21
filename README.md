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
pnpm run test:node
pnpm run test:browser
pnpm run test:server-db:electron
```

On a Linux host that needs Chromium system dependencies, use
`pnpm exec playwright install --with-deps chromium`. For a focused test run,
pass a Vitest project such as `--project core` to `pnpm exec vp test run`.
`test:node` runs every Node project except the server's SQLite and RPC suites,
`test:browser` runs the Chromium suite, and the Electron database suite runs the
server suites under the same embedded Node runtime the desktop app ships, so
nothing runs twice. `pnpm exec vp test run` still runs every project under Node.

CI runs this gate, plus packaging and the packaged smoke, on GitHub-hosted
Linux and Windows runners for every pull request and push to `main`. See
[CI](docs/CI.md). To run it before pushing, use `pwsh ./scripts/ci-local.ps1`
on Windows or `bash scripts/ci-local.sh` on Linux.

## Package and smoke-test

```sh
pnpm run package:desktop
pnpm run test:desktop
```

The installer and unpacked executable are written to `apps/desktop/dist/package`.
Playwright runs the unpacked executable against temporary databases. On headless
Linux, run the smoke suite with `xvfb-run -a pnpm run test:desktop`. The packaged
executable needs a working Chromium sandbox. The Linux tray smoke starts a private
session bus with `dbus-daemon` and checks it with `dbus-send`.

For end-to-end tests only, the JSON and CSV import and export file dialogs answer
with a fixed path when both `TASKTRACKER_SMOKE=1` and `TASKTRACKER_TEST_FILE_PATH`
are set.
Without both, the native dialog is always shown, so a normal run cannot overwrite
or read a file by accident.

On Windows, `pwsh ./scripts/pull-build-run.ps1` closes this checkout's unpacked
app, fast-forward pulls the current branch, packages Electron and runs the
unpacked build. When installing or rebuilding, keep the database and backups
outside the install or build directory. Defaults are `%LocalAppData%/TaskTracker`
on Windows and `~/.local/share/TaskTracker` on Linux (or absolute `XDG_DATA_HOME`).

## Install a release

Download the package for your system from the repository's **Releases** page.
Windows packages are unsigned. macOS packages are ad-hoc signed, without an
Apple Developer ID or notarization. Only approve an OS prompt for a release you
obtained from this repository.

- **Windows x64.** Run `task-tracker-<version>-win-x64.exe`. The per-user
  installer creates Start menu and desktop shortcuts. If SmartScreen prompts,
  use **More info → Run anyway**.
- **Linux x64.** Make `task-tracker-<version>-linux-x64.AppImage` executable
  with `chmod +x` and run it. If mounting fails, install your distribution's
  FUSE 2 compatibility library or launch with `APPIMAGE_EXTRACT_AND_RUN=1`.
- **macOS Apple silicon.** Open `task-tracker-<version>-mac-arm64.dmg` and
  drag **Task Tracker** to Applications, or unzip the app and move it there.
  If Gatekeeper blocks the first launch, try opening the app and then use
  **System Settings → Privacy & Security → Open Anyway**.

To uninstall, use **Settings → Apps → Installed apps → Task Tracker → Uninstall**
on Windows, delete the AppImage on Linux, or move **Task Tracker.app** to the
Trash on macOS. The database and its backups live in a separate directory.
The Windows uninstaller also removes the start-with-system entry. On Linux,
turn **Start Task Tracker when I sign in** off before deleting the AppImage, or
delete `~/.config/autostart/task-tracker.desktop` (under `$XDG_CONFIG_HOME`
when that is an absolute path) afterwards. The saved preference stays in the
database, and saving App Settings in a reinstalled build writes the entry again.

| System  | Default data directory                                                                |
| ------- | ------------------------------------------------------------------------------------- |
| Windows | `%LocalAppData%/TaskTracker`                                                          |
| Linux   | `~/.local/share/TaskTracker` or `$XDG_DATA_HOME/TaskTracker` if that base is absolute |
| macOS   | `~/Library/Application Support/TaskTracker`                                           |

Keep custom `TASKTRACKER_DB_PATH` files and their backups outside the installed
app, AppImage, and package output directories. The first launch backs up a
recognized database before migrating it.

### Updates and start with system

The installed Windows build and the Linux AppImage offer **Check for updates**,
**Download** and **Restart to update** in **App Settings → About**, and the
**Start Task Tracker when I sign in** option. Development, unpacked and macOS
builds show the version only. macOS has no auto-update because updating a Mac
app needs an Apple Developer ID signature, so install a new macOS release by
hand. The app checks only when asked. It reads the stable channel
(`latest.yml` or `latest-linux.yml`), so prereleases are never offered. It downloads the installer into its profile and keeps it only when
its size and SHA-512 match the release metadata, and checks it again just
before installing. Restart to update replaces the AppImage in place and
relaunches it, or runs the Windows installer silently as an update. A declined
restart installs the download at the next launch.

The legacy app started with Windows through a `TaskTracker` value under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. The first launch of the
installed Windows build deletes that value, so the old app no longer starts at
sign-in, and if it was there writes the new app's own entry instead. Later
launches find no legacy value and leave the setting alone.

The feed is the folder that holds the release metadata and installers. Packaged
builds use `https://github.com/<owner>/<repo>/releases/latest/download/`, which
needs public release assets, or the `TASKTRACKER_UPDATE_FEED_URL` value set when
packaging. Setting `TASKTRACKER_UPDATE_FEED_URL` when launching the app
overrides it. Feeds must use HTTPS, except on the loopback interface.

## Cut a release

1. Make sure CI is green on the commit to release.
2. Choose the version, such as `v0.2.0`, or `v0.2.0-rc.1` for a prerelease.
   The tag supplies the version to every package, so no file needs a bump.
3. Tag the commit and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

The [release workflow](.github/workflows/release.yml) then builds on
GitHub-hosted runners, smoke-tests each package and publishes one release.

| Runner           | Assets                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| `windows-latest` | `task-tracker-<version>-win-x64.exe`, its `.blockmap`, `latest.yml`                     |
| `ubuntu-latest`  | `task-tracker-<version>-linux-x64.AppImage`, `latest-linux.yml`                         |
| `macos-latest`   | `task-tracker-<version>-mac-arm64.dmg` and `.zip`, their `.blockmap`s, `latest-mac.yml` |

A prerelease tag writes `beta*.yml` instead of `latest*.yml` and is marked as a
prerelease, so installed builds never offer it. A stable release becomes the
repository's latest release, which is the update feed for Windows and Linux.
The macOS build is Apple silicon only and has no auto-update (see
[Updates and start with system](#updates-and-start-with-system)). If a job
fails for a transient reason, re-run the failed jobs and the publish job resumes
the draft. A fix that needs a new commit needs a new version tag.

## Verify a release

Build on native Windows x64, Linux x64, and macOS arm64 using the same version
tag and revision. A local build can use an example tag without creating it.

```sh
pnpm run package:desktop v0.2.0-rc.1
pnpm run test:desktop
```

On Linux, source `scripts/dev-env.sh` before packaging and use
`xvfb-run -a pnpm run test:desktop` on a headless machine. Copy
`apps/desktop/dist/package/release/` from each build into a directory named
`win-x64`, `linux-x64`, or `mac-arm64` under one common parent. Verify the
complete assembly locally.

```sh
node apps/desktop/scripts/publish-release.ts v0.2.0-rc.1 release-bundles
```

This dry run checks that every installer, archive, blockmap and update
metadata file matches its native build checksum. Pushing a valid `v*` tag
starts the [release workflow](.github/workflows/release.yml). It packages and
smoke-tests before uploading the verified files to one draft and checking the
uploaded digests. A retry resumes a leftover draft, skipping files already
uploaded with a matching name and checksum. It refuses a draft holding other
files and never deletes a release. A published release is left intact. Prereleases use `beta*.yml` and GitHub's prerelease flag.
Stable releases use `latest*.yml`. See [CI](docs/CI.md#release) for the jobs.

For the Windows installer acceptance check, use a disposable standard user.
Put a copy of the supported legacy database in the default data directory
before launching the app. Install without elevation, verify the shortcuts,
then launch and confirm the legacy data appears and a readable pre-migration
backup is present. Close the app, record hashes of the database and backup,
uninstall via Settings, and compare both hashes. Reinstall and verify the same
data opens. On Linux and macOS, repeat the data checks while replacing or
removing the AppImage or app bundle.

## Workspace layout

| Package              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `packages/core`      | Pure domain models and business rules     |
| `packages/contracts` | Shared schemas and RPC contracts          |
| `apps/server`        | SQLite persistence, services and RPC      |
| `apps/web`           | React renderer                            |
| `apps/desktop`       | Electron shell, packaging and smoke tests |
