# Continuous integration

The repository is private, so GitHub bills every minute on its hosted runners (Windows at
twice the Linux rate, macOS at ten times). To keep that cost at zero, day-to-day CI runs on
self-hosted runners and on the developer's machine. GitHub-hosted runners are used only for
tagged releases and for manual runs that ask for them.

| What | Where it runs | When |
|---|---|---|
| Local gate (`scripts/ci-local.*`) | The developer's machine | Before every push |
| `ci.yml` → `build.yml`, Linux | Self-hosted runner (`self-hosted, linux, x64`) | Push to `main` and pull requests, when `CI_LINUX_SELF_HOSTED` is `true` |
| `ci.yml` → `build.yml`, Windows | Self-hosted runner (`self-hosted, windows, x64`) | Push to `main` and pull requests, when `CI_WINDOWS_SELF_HOSTED` is `true` |
| `ci.yml` on GitHub-hosted runners | GitHub (billed) | Only from **Actions → CI → Run workflow** with **Use GitHub-hosted runners** ticked |
| `release.yml` | GitHub (billed) | Pushing a `v*` tag (§7.13); it needs macOS |

With a variable unset, that OS's jobs are skipped. Skipped jobs cost nothing, so nothing is
billed while a runner is offline.

## Local gate

Run the same checks CI runs (restore, Release build, format check, all tests, the release-script
tests on Linux, and a pack for this OS):

```sh
pwsh ./scripts/ci-local.ps1             # Windows (or any OS with PowerShell 7)
bash scripts/ci-local.sh                # Linux or macOS
```

Add `-SkipPack` / `--skip-pack` to skip the few-minute publish and pack. Snapshot failures leave
`*.received.png` next to the baselines.

## Linux runner (Docker)

Needs a Linux x64 machine with Docker and Compose. The image is Ubuntu 24.04, the same as GitHub's
`ubuntu-latest`, with the fonts and libraries the headless snapshot tests need.

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

`*.windows.png` baselines are approved locally on Windows. For `*.linux.png`, take the failed CI
run's `received-snapshots-linux` artifact, review the images and commit them as baselines. Without
a Linux runner, run the tests on a Linux machine (for example the server, with
`bash scripts/ci-local.sh --skip-pack`) and take the `*.received.png` files from there.

The first runs on a self-hosted Linux runner may show small font-rendering differences from the
baselines made on GitHub's runners. If they do, review the received images once and replace the
Linux baselines.

## Security

Self-hosted runners run whatever a workflow tells them to. That is safe here because the repository
is private: only collaborators can push branches or open pull requests. If the repository is ever
made public, remove the runners or limit them to `main` first.
