#Requires -Version 7.4
param([switch] $SkipPack)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    pnpm install --frozen-lockfile
    pnpm exec playwright install chromium
    pnpm run build
    pnpm exec vp check --deny-warnings
    pnpm run test:node
    pnpm run test:browser
    pnpm run test:server-db:electron
    pnpm run check:electron

    if (!$SkipPack) {
        # The build above is current, so package without package:desktop rebuilding.
        pnpm --filter @task-tracker/desktop run package
        pnpm run test:desktop
    }
} finally {
    Pop-Location
}
