#Requires -Version 7
<#
.SYNOPSIS
    Runs the CI checks on this machine: build, format, tests and a pack.

.DESCRIPTION
    Runs the same steps as .github/workflows/build.yml for the current OS, so a change can be
    checked without GitHub-hosted runners (docs/CI.md). Stops at the first failing step.

    Snapshot tests write *.received.png next to the baselines when an image differs or a
    baseline is missing.

.PARAMETER SkipPack
    Skips the self-contained publish and Velopack pack, which take a few minutes.

.EXAMPLE
    ./scripts/ci-local.ps1

.EXAMPLE
    ./scripts/ci-local.ps1 -SkipPack
#>
param([switch] $SkipPack)
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Step
{
    param([string] $Description, [scriptblock] $Command)

    Write-Host "==> $Description" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0)
    {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

function Get-PackTarget
{
    if ($IsWindows)
    {
        return @{ Runtime = 'win-x64'; Channel = 'win' }
    }

    if ($IsMacOS)
    {
        return @{ Runtime = 'osx-arm64'; Channel = 'osx' }
    }

    return @{ Runtime = 'linux-x64'; Channel = 'linux' }
}

function Invoke-Pack
{
    $target = Get-PackTarget
    if ($IsWindows)
    {
        Invoke-Step 'Pack' { & (Join-Path $PSScriptRoot 'pack.ps1') -Runtime $target.Runtime }
    }
    else
    {
        Invoke-Step 'Pack' { bash (Join-Path $PSScriptRoot 'pack.sh') $target.Runtime }
    }

    & (Join-Path $PSScriptRoot 'verify-package-id.ps1') -Runtime $target.Runtime -Channel $target.Channel
}

Push-Location $repoRoot
try
{
    Invoke-Step 'Restore' { dotnet restore }
    Invoke-Step 'Build' { dotnet build --no-restore --configuration Release }
    Invoke-Step 'Format check' { dotnet format TaskTracker.slnx --verify-no-changes --no-restore }
    Invoke-Step 'Test' { dotnet test --no-build --configuration Release }

    if ($IsLinux)
    {
        Invoke-Step 'Release script tests' { bash tests/scripts/publish-release-tests.sh }
    }

    if (-not $SkipPack)
    {
        Invoke-Pack
    }

    Write-Host 'All CI checks passed.' -ForegroundColor Green
}
finally
{
    Pop-Location
}
