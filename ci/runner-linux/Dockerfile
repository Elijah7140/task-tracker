# A self-hosted GitHub Actions runner for Task Tracker CI (docs/CI.md).
# Ubuntu 24.04 matches GitHub's ubuntu-latest, so headless snapshots render with the same fonts.
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
# Leave empty to install the newest runner release; the runner keeps itself up to date after that.
ARG RUNNER_VERSION=

# Tools and desktop libraries used by Chromium, Electron and electron-builder.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq unzip zip tar gzip xz-utils sudo \
        xvfb xauth libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libnotify4 \
        fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Playwright installs browser system packages and the smoke step sets sandbox ownership.
RUN useradd --create-home --shell /bin/bash runner \
    && echo 'runner ALL=(root) NOPASSWD: ALL' > /etc/sudoers.d/runner \
    && chmod 0440 /etc/sudoers.d/runner
WORKDIR /home/runner/actions-runner

RUN version="${RUNNER_VERSION}" \
    && if [ -z "$version" ]; then \
        version="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')"; \
    fi \
    && curl -fsSL -o runner.tar.gz \
        "https://github.com/actions/runner/releases/download/v${version}/actions-runner-linux-x64-${version}.tar.gz" \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && ./bin/installdependencies.sh \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R runner:runner /home/runner

COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh

USER runner

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
