# Continuous integration

All CI and release automation runs on standard GitHub-hosted runners, which are
free for this public repository. There are no self-hosted runners.

| Workflow | Jobs and runners | When |
|---|---|---|
| [CI](../.github/workflows/workspace.yml) | Build and test on `ubuntu-latest` and `windows-latest` | Every branch push and pull request, or **Actions → CI → Run workflow** |
| [Release](../.github/workflows/release.yml) | Package on `windows-latest`, `ubuntu-latest` and `macos-latest`, then publish on `ubuntu-latest` | Push of a `v*` tag |
| Local gate (`scripts/ci-local.*`) | Developer machine | Optional, before pushing |

## CI

Each job runs the frozen install, Playwright Chromium, build, the static check
with `--deny-warnings`, the Vite renderer probe, `vp test run`, the embedded Node
SQLite tests (`test:server-db:electron`), the Electron runtime check,
`package:desktop` and the packaged smoke (`test:desktop`). The Linux job runs
the Electron steps under `xvfb-run -a` and makes the packaged `chrome-sandbox`
setuid root first, as WP22 introduced. A newer push to the same branch or pull
request cancels a running build, except on `main`.

Each job uploads its installer as `package-linux-x64` or `package-windows-x64`
for a week. A failing job uploads differing screenshots as
`browser-screenshot-diffs-linux` or `browser-screenshot-diffs-windows`.

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

The gate runs the same steps as CI except the renderer probe. Select
`-SkipPack` on Windows or `--skip-pack` on Linux to omit packaging and packaged smoke.

## Snapshot baselines

Review Windows baselines on Windows and Linux baselines on Linux. Use the
`browser-screenshot-diffs-*` artifact of a failing CI job or the received images
from a local test run on that OS.

## Security

The repository is public, so anyone can open a pull request. Workflows use
`pull_request`, never `pull_request_target`, so fork pull requests run without
secrets and with a read-only token. Both workflows default to
`contents: read` and check out without persisting credentials. Only the Release
publish job has `contents: write`, and it runs only for a pushed tag, which
needs write access to the repository. No workflow uses repository secrets.
