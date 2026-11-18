#Requires -Version 7
<#
.SYNOPSIS
    Checks that a packed release does not use the data folder's name as its package id.

.DESCRIPTION
    On Windows, Velopack installs to %LocalAppData%\<packId> and deletes that folder on uninstall.
    The database lives in %LocalAppData%\TaskTracker, so no package asset may use the id
    'TaskTracker' (§7.13). Run after scripts/pack.ps1 or scripts/pack.sh.

.EXAMPLE
    ./scripts/verify-package-id.ps1 -Runtime win-x64 -Channel win
#>
param(
    [Parameter(Mandatory)] [string] $Runtime,
    [Parameter(Mandatory)] [string] $Channel
)
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "artifacts/releases/$Runtime/releases.$Channel.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (-not $manifest.Assets -or $manifest.Assets.PackageId -contains 'TaskTracker')
{
    throw 'The release manifest must contain package assets whose id differs from the TaskTracker data folder.'
}

Write-Host "Package ids in $manifestPath are safe."
