#!/usr/bin/env bash
# Runs the CI checks on this machine: build, format, tests and a pack (docs/CI.md).
# The same steps as .github/workflows/build.yml for Linux or macOS. Stops at the first failure.
#
# Usage: scripts/ci-local.sh [--skip-pack]
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
skip_pack=false
if [ "${1:-}" = "--skip-pack" ]; then
  skip_pack=true
fi

step() {
  echo "==> $1"
}

cd "$root"
if [ -f scripts/dev-env.sh ]; then
  # shellcheck source=dev-env.sh
  . scripts/dev-env.sh
fi

step "Restore"
dotnet restore
step "Build"
dotnet build --no-restore --configuration Release
step "Format check"
dotnet format TaskTracker.slnx --verify-no-changes --no-restore
step "Test"
dotnet test --no-build --configuration Release

if [ "$(uname -s)" = "Linux" ]; then
  step "Release script tests"
  bash tests/scripts/publish-release-tests.sh
fi

if [ "$skip_pack" = false ]; then
  if [ "$(uname -s)" = "Darwin" ]; then
    runtime="osx-arm64"
    channel="osx"
  else
    runtime="linux-x64"
    channel="linux"
  fi
  step "Pack"
  bash scripts/pack.sh "$runtime"
  pwsh -NoProfile -File scripts/verify-package-id.ps1 -Runtime "$runtime" -Channel "$channel"
fi

echo "All CI checks passed."
