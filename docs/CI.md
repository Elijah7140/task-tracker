# Continuous integration

All CI and release automation runs on standard GitHub-hosted runners, which are
free for this public repository. There are no self-hosted runners.

| Workflow | Jobs and runners | When |
|---|---|---|
| [CI](../.github/workflows/workspace.yml) | Checks, browser tests and packaged smoke on `ubuntu-latest` and `windows-latest` | Every pull request and push to `main` that changes more than Markdown, or **Actions → CI → Run workflow** |
| [Windows screenshots](../.github/workflows/windows-screenshots.yml) | Capture every browser-test screenshot on `windows-latest` for review | **Actions → Windows screenshots → Run workflow** on any branch |
| [Release](../.github/workflows/release.yml) | Package on `windows-latest`, `ubuntu-latest` and `macos-latest`, then publish on `ubuntu-latest` | Push of a `v*` tag. **Actions → Release → Run workflow** runs a dry run that publishes nothing |
| Local gate (`scripts/ci-local.*`) | Developer machine | Optional, before pushing |

## CI

CI runs six parallel jobs per OS and one more on Windows, thirteen in all. Each starts with the shared
[setup action](../.github/actions/setup-workspace/action.yml): pnpm, Node, the
frozen install and only the prerequisites that job needs.

| Job | Steps |
|---|---|
| Build, check and Node tests | Build, the static check with `--deny-warnings`, the Vite renderer probe, `test:node`, the server's SQLite and RPC suites under Electron (`test:server-db:electron`), the Electron runtime check, and the installers |
| Browser tests, shards 1/3 to 3/3 | Playwright Chromium (cached) and a third of the `web-browser` files each (`test:browser --shard`) |
| Packaged desktop smoke, shards 1/2 and 2/2 | `package:desktop` without the installer and half of the packaged smoke files each (`test:desktop --shard`) |
| Installed update (Windows only) | Builds this commit's NSIS installer and a newer one, then `test:installed-update` |

The server's SQLite and RPC suites run only under Electron's embedded Node, the
runtime that ships, and not again under Node 26. Pushes to branches other than
`main` do not start CI on their own, so a pull request's commits run once.
A newer push to the same pull request cancels its running build. On `main` each
commit has its own concurrency group, so every commit gets a result: a run
neither waits for an earlier one nor is dropped while it is pending.

A push or pull request that changes only Markdown files starts no run
(`paths-ignore`). After such a push to `main` there is no CI result to wait for.

Vitest assigns files to shards by a hash of their paths, not by how long they
take. With two browser shards one of them held most of the slow suites and ran
197 s against 112 s on Windows. Three shards keep the slowest one shorter than
the packaged smoke.

The packaged smoke files run one at a time within a shard (`fileParallelism:
false`), because on Linux they share one Xvfb display without a window manager.
Splitting them across two jobs halves that serial time. Before the first file, a
global setup launches the packaged app once and waits for its menu bar, because
the first launch on a fresh runner is several seconds slower. Without it, a test
that clicks the menu bar straight after launch failed whenever it ran first in its
shard. Each smoke shard packages
the app itself with `TASKTRACKER_PACKAGE_UNPACKED=1`, which builds the unpacked
app the suites launch and skips the installer (about 46 s on Windows). The Linux
checks job builds the AppImage and the installed-update job builds the Windows
installer. electron-builder's downloads, chiefly NSIS and 7-Zip on
Windows, are cached between runs. The Linux jobs run the Electron steps under `xvfb-run -a` and
make every `chrome-sandbox` setuid root first, as WP22 introduced.

Electron main logs how long each server stop takes. It kills a server that has
not exited 10 seconds after main closed its stdin, and its warning then includes
the server's report of the handles it was still waiting on. Node 24 in Electron
counts a connection that has not sent a request as active, so the server destroys
its remaining connections once it has interrupted every request. A smoke test
quits with the main window, the tray card and such a connection open and requires
the stop to take under 2 seconds.

A full local `vp test run` runs the Node projects first and `web-browser` after them
(`sequence.groupOrder`). When Chromium ran alongside them on the four-core Windows
runner, it starved the Node workers. Loopback RPC tests then took up to 5 s and
timed out. Isolated, the same tests finish in under 1 s. CI keeps them in separate
jobs.

On Windows the test steps run with `TEMP` and `TMP` set to `RUNNER_TEMP`. The default
`%TEMP%` is on the runner's C: OS disk, where each flush to disk takes about 4 ms and
sometimes over 200 ms. SQLite tests that use temporary files flush on every write
commit, startup backup and close. On C:, one startup backup took 2 s, and the EF
fixture RPC tests sometimes passed the 5 s timeout. The D: drive that holds
`RUNNER_TEMP` flushes in 0.1 ms. Defender real-time scanning is off on these runners,
so it plays no part.

The Linux checks job uploads the AppImage as `package-linux-x64` and the
installed-update job uploads the Windows installer as `package-windows-x64`, each
for a week. A failing browser shard uploads differing
screenshots as `browser-screenshot-diffs-<os>-<shard>`, for example
`browser-screenshot-diffs-linux-2`. Only Linux shards compare screenshots.

The installed-update job is the only automated check of the Windows update path.
It installs this commit's build silently for the runner's user, leaves a newer
installer in the profile as a verified pending update, and launches the app. The
app must quit by itself, the installed version must change and the new version
must be running. The installer starts the updated app without the test
environment, so it opens the default data folder. The suite therefore refuses to
run anywhere but a GitHub-hosted Windows runner
([windows-update.test.ts](../apps/desktop/test/installed/windows-update.test.ts)).

## Release

See [Cut a release](../README.md#cut-a-release). Each package job starts with
the same setup action as CI, builds the tagged version on its own OS, runs the
packaged smoke and uploads the files listed in `release-files.ts` with their
native SHA-256 checksums. The publish
job verifies those checksums, uploads everything to one draft, checks the
uploaded digests and then publishes.

CI builds no macOS package, so a tag used to be the first time one was built, and
`v0.1.0` needed four runs. Rehearse a release first with a dry run:
`gh workflow run release.yml -f version=v0.2.0`, or **Actions → Release → Run
workflow**. It runs the same package jobs for that version and verifies the
assembly, and skips the publish step. See
[release verification](../README.md#verify-a-release) for the local equivalent.

The macOS runner has three cores and 7 GB, and a freshly booted one is busy with its
own daemons. Sampled during the smoke, the CPU was 6 to 11 % idle, and Spotlight's
indexers used about half a core on average and up to 1.4 cores, more than the app
under test. Stretches of the smoke then ran three to four times slower: the whole
smoke took 346 s on a quiet runner and up to 776 s on a busy one, and three of five
macOS jobs for `v0.4.0` failed on timeouts in different tests. The setup action
therefore turns Spotlight indexing off on macOS, which left 21 to 29 % idle in five
of six runs. Other daemons (`simdiskimaged` mounting simulator images, `trustd`,
`softwareupdated`) still slow some runs, so the smoke also allows 10 s for an action
or a poll and 60 s for a test
([vitest.config.ts](../apps/desktop/vitest.config.ts)). Vitest's default poll
timeout of 1 s caused about half of those failures.

## Local gate

Install the Node and pnpm versions from the repository pins. On Linux use a machine
with Chromium dependencies, GTK, Xvfb and the D-Bus tools (`dbus-daemon`, `dbus-send`).
Run:

```sh
pwsh ./scripts/ci-local.ps1             # Windows with PowerShell 7.4+
bash scripts/ci-local.sh               # Linux
```

The gate runs the same steps as CI, one after another, except the renderer probe. Select
`-SkipPack` on Windows or `--skip-pack` on Linux to omit packaging and packaged smoke.

## Snapshot baselines

Screenshot baselines are Linux-only. Linux Chromium output is reproducible with the
pinned fontconfig and launch switches in `vite.config.ts`. Windows output changes
between Windows builds, so a Windows baseline would only describe one runner image,
not the Windows 11 desktops the app runs on, and every image update needed a second
CI round.

Review Linux baselines from the `browser-screenshot-diffs-linux-*` artifacts of the
failing CI shards or the received images from a local Linux run. On Windows,
`toMatchScreenshot` passes without capturing
([linux-only-screenshots.ts](../apps/web/test/support/linux-only-screenshots.ts)); the
same tests still run every other assertion there, and the packaged smoke tests the
real Windows desktop.

To see how screens look on Windows, run the **Windows screenshots** workflow on the
branch. It sets `TASKTRACKER_CAPTURE_SCREENSHOTS=1`, runs `test:browser --update` on
`windows-latest` and uploads every `*-win32.png` as the `windows-screenshots` artifact
for two weeks. It never fails a build over a difference. `.gitignore` keeps captured
Windows images out of commits.

## Security

The repository is public, so anyone can open a pull request. Workflows use
`pull_request`, never `pull_request_target`, so fork pull requests run without
secrets and with a read-only token. Both workflows default to
`contents: read` and check out without persisting credentials. Only the Release
publish job has `contents: write`. Its publish step, the only step given the
token, runs only for a pushed tag, which needs write access to the repository. No workflow uses repository secrets.
