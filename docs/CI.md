# Continuous integration

Day-to-day CI uses enabled self-hosted runners to avoid billed GitHub-hosted
minutes. Run the local gate for each OS without an enabled runner.

| What | Where it runs | When |
|---|---|---|
| Local gate (`scripts/ci-local.*`) | Developer machine | Before pushing if that OS has no enabled runner |
| `workspace.yml` → `workspace-build.yml`, Linux | `self-hosted, linux, x64` | Push to `main` or pull request when `CI_LINUX_SELF_HOSTED` is `true` |
| `workspace.yml` → `workspace-build.yml`, Windows | `self-hosted, windows, x64` | Push to `main` or pull request when `CI_WINDOWS_SELF_HOSTED` is `true` |
| Manual CI on GitHub-hosted runners | GitHub (billed) | From **Actions → CI → Run workflow**, with **Use GitHub-hosted runners** selected |

Unset variables skip the corresponding jobs. The Electron tagged release workflow
is planned in [§7.13](PLAN.md#713-installers-and-releases).

## Local gate

Install the Node and pnpm versions from the repository pins. On Linux use a machine
with Chromium dependencies, GTK and Xvfb. Run:

```sh
pwsh ./scripts/ci-local.ps1             # Windows with PowerShell 7.4+
bash scripts/ci-local.sh               # Linux
```

The gate runs the frozen install, build, static check, Chromium tests, embedded
Node SQLite tests, Electron runtime check, packaging and packaged smoke. Select
`-SkipPack` on Windows or `--skip-pack` on Linux to omit packaging and packaged smoke.

## Linux runner (Docker)

Needs a Linux x64 machine with Docker and Compose. The image is Ubuntu 24.04, the same as GitHub's
`ubuntu-latest`, with fonts and desktop libraries for Chromium snapshots and Electron smoke.
Rebuild an existing runner image to pick up these dependencies. The Linux jobs
use sudo to install browser dependencies and set the packaged Chromium sandbox owner.
The container has `SYS_ADMIN` so the setuid helper can create PID and network namespaces.
Run this container on a trusted runner host.

1. On GitHub, open **Settings → Actions → Runners → New self-hosted runner** and copy the token
   from the `--token` argument. It expires after an hour.
2. On the server, from a clone of this repository:

   ```sh
   cd ci/runner-linux
   RUNNER_TOKEN=<token> docker compose up -d --build
   ```

   The runner registers on first start and keeps the registration in a Docker volume, so
   restarts need no token. It restarts with Docker and updates itself.
3. Check the runner shows as **Idle** under **Settings → Actions → Runners**.
4. Under **Settings → Secrets and variables → Actions → Variables**, add `CI_LINUX_SELF_HOSTED`
   with the value `true`.

To remove it: `docker compose down -v`, then delete the runner on the Runners page.

## Windows runner

Needs a Windows x64 machine that stays on while you push. It may be the development PC.

1. Get a registration token as in step 1 above.
2. In an elevated PowerShell 7 window, from a clone of this repository:

   ```powershell
   ./ci/install-windows-runner.ps1 -Token <token>
   ```

   This installs the runner to `C:\actions-runner` as a Windows service that starts with the
   machine.
3. Add the repository variable `CI_WINDOWS_SELF_HOSTED` with the value `true`.

To remove it: in `C:\actions-runner`, run `.\svc.cmd uninstall` (if present) and
`.\config.cmd remove --token <removal token from the Runners page>`.

## Snapshot baselines

Review Windows baselines on Windows and Linux baselines on Linux. CI uploads
differences as `browser-screenshot-diffs-linux` or `browser-screenshot-diffs-windows`.
With no runner enabled, use the received images from a local test run on that OS.

## Security

Self-hosted runners run whatever a workflow tells them to. That is safe here because the repository
is private: only collaborators can push branches or open pull requests. If the repository is ever
made public, remove the runners or limit them to `main` first.
