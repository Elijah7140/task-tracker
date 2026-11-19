#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
. scripts/dev-env.sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run build
pnpm exec vp check --deny-warnings
pnpm exec vp test run
pnpm run test:server-db:electron
xvfb-run -a pnpm run check:electron

if [[ "${1:-}" != --skip-pack ]]; then
  pnpm run package:desktop
  xvfb-run -a pnpm run test:desktop
fi
