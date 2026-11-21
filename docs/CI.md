# Continuous integration

All CI and release automation runs on standard GitHub-hosted runners, which are
free for this public repository. There are no self-hosted runners.

| Workflow | Jobs and runners | When |
|---|---|---|
| [CI](../.github/workflows/workspace.yml) | Checks, browser tests and packaged smoke on `ubuntu-latest` and `windows-latest` | Every pull request and push to `main`, or **Actions → CI → Run workflow** |
| [Release](../.github/workflows/release.yml) | Package on `windows-latest`, `ubuntu-latest` and `macos-latest`, then publish on `ubuntu-latest` | Push of a `v*` tag |
| Local gate (`scripts/ci-local.*`) | Developer machine | Optional, before pushing |

## CI

CI runs five parallel jobs per OS, ten in all. Each starts with the shared
[setup action](../.github/actions/setup-workspace/action.yml): pnpm, Node, the
frozen install and only the prerequisites that job needs.

| Job | Steps |
|---|---|
| Build, check and Node tests | Build, the static check with `--deny-warnings`, the Vite renderer probe, `test:node`, the server's SQLite and RPC suites under Electron (`test:server-db:electron`) and the Electron runtime check |
| Browser tests, shards 1/2 and 2/2 | Playwright Chromium (cached) and half of the `web-browser` files each (`test:browser --shard`) |
| Packaged desktop smoke, shards 1/2 and 2/2 | `package:desktop` and half of the packaged smoke files each (`test:desktop --shard`) |

The server's SQLite and RPC suites run only under Electron's embedded Node, the
runtime that ships, and not again under Node 26. Pushes to branches other than
`main` do not start CI on their own, so a pull request's commits run once.
A newer push to the same pull request cancels a running build, except on `main`.

The packaged smoke files run one at a time within a shard (`fileParallelism:
false`), because on Linux they share one Xvfb display without a window manager.
Splitting them across two jobs halves that serial time. Each smoke shard packages
the app itself. electron-builder's downloads, chiefly NSIS and 7-Zip on Windows, are
cached between runs. The Linux jobs run the Electron steps under `xvfb-run -a` and
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

The first smoke shard of each OS uploads its installer as `package-linux-x64` or
`package-windows-x64` for a week. A failing browser shard uploads differing
screenshots as `browser-screenshot-diffs-<os>-<shard>`, for example
`browser-screenshot-diffs-windows-2`.

## Release

See [Cut a release](../README.md#cut-a-release). Each package job builds the
tagged version on its own OS, runs the packaged smoke and uploads the files
listed in `release-files.ts` with their native SHA-256 checksums. The publish
job verifies those checksums, uploads everything to one draft, checks the
uploaded digests and then publishes. See
[release verification](../README.md#verify-a-release) for the local dry run.

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

Review Windows baselines on Windows and Linux baselines on Linux. Use the
`browser-screenshot-diffs-*` artifacts of the failing CI shards or the received images
from a local test run on that OS.

## Security

The repository is public, so anyone can open a pull request. Workflows use
`pull_request`, never `pull_request_target`, so fork pull requests run without
secrets and with a read-only token. Both workflows default to
`contents: read` and check out without persisting credentials. Only the Release
publish job has `contents: write`, and it runs only for a pushed tag, which
needs write access to the repository. No workflow uses repository secrets.
