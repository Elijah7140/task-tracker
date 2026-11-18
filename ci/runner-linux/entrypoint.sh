#!/usr/bin/env bash
# Registers the runner on first start, then runs it. The registration is kept in the
# runner volume, so later starts need no token.
set -euo pipefail

cd /home/runner/actions-runner

if [ ! -f .runner ]; then
  : "${RUNNER_URL:?Set RUNNER_URL to the repository URL, e.g. https://github.com/owner/repo}"
  : "${RUNNER_TOKEN:?Set RUNNER_TOKEN to a registration token from the repository's Settings > Actions > Runners > New self-hosted runner}"
  ./config.sh --unattended --replace \
    --url "$RUNNER_URL" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-$(hostname)}" \
    --labels "${RUNNER_LABELS:-linux,x64}" \
    --work _work
fi

exec ./run.sh
