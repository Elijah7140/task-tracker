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
    pnpm exec vp test run
    pnpm run test:server-db:electron
    pnpm run check:electron

    if (!$SkipPack) {
        pnpm run package:desktop
        pnpm run test:desktop
    }
} finally {
    Pop-Location
}
