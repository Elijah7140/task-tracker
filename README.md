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

## Install a release

Download the package for your system from the repository's **Releases** page.
Windows packages are unsigned and macOS packages are ad-hoc signed without
notarization. Only approve an OS prompt for a release you obtained from this
repository.

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

| System  | Default data directory                                                                |
| ------- | ------------------------------------------------------------------------------------- |
| Windows | `%LocalAppData%/TaskTracker`                                                          |
| Linux   | `~/.local/share/TaskTracker` or `$XDG_DATA_HOME/TaskTracker` if that base is absolute |
| macOS   | `~/Library/Application Support/TaskTracker`                                           |

Keep custom `TASKTRACKER_DB_PATH` files and their backups outside the installed
app, AppImage, and package output directories. The first launch backs up a
recognized database before migrating it. In-app updating and start-with-system
are tracked in [WP42](docs/MIGRATION.md#wp42--updates-about-and-start-with-system).

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
Stable releases use `latest*.yml`. See [CI setup](docs/CI.md) for runner selection.

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
