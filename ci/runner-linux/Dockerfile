# A self-hosted GitHub Actions runner for Task Tracker CI (docs/CI.md).
# Ubuntu 24.04 matches GitHub's ubuntu-latest, so headless snapshots render with the same fonts.
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
# Leave empty to install the newest runner release; the runner keeps itself up to date after that.
ARG RUNNER_VERSION=

# Tools the workflows call, plus the fonts and native libraries Avalonia's headless renderer
# (SkiaSharp, HarfBuzz) and .NET (ICU) load. DejaVu Sans Mono is the code font on Linux.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq unzip zip tar gzip xz-utils sudo \
        libicu74 libfontconfig1 libfreetype6 libx11-6 libice6 libsm6 \
        fonts-dejavu-core fonts-liberation \
        wget apt-transport-https \
    && wget -q https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends powershell \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash runner
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
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
