<#
.SYNOPSIS
    Publishes Task Tracker self-contained for one runtime and packs it with Velopack (§7.13).

.DESCRIPTION
    Writes the publish output to artifacts/publish/<runtime> and the Velopack release files
    (Setup.exe, the portable zip, the .nupkg and releases.<channel>.json) to
    artifacts/releases/<runtime>. Both folders are emptied first. Velopack packs for the OS it
    runs on, so use this script on Windows and scripts/pack.sh on Linux and macOS.

.PARAMETER Runtime
    The .NET runtime identifier to publish for. Defaults to win-x64.

.PARAMETER Version
    The package version, e.g. 0.2.0. Defaults to <Version> in Directory.Build.props.

.EXAMPLE
    ./scripts/pack.ps1
    ./scripts/pack.ps1 -Runtime win-x64 -Version 0.2.0
#>
param(
    [string] $Runtime = 'win-x64',
    [string] $Version = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Not 'TaskTracker': Velopack installs to %LocalAppData%\<packId> and deletes that whole folder on
# uninstall, while the database lives in %LocalAppData%\TaskTracker (§7.13). Keep in step with pack.sh.
$packId = 'TaskTrackerApp'

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'src/TaskTracker.App.Desktop/TaskTracker.App.Desktop.csproj'
$publishDir = Join-Path $root "artifacts/publish/$Runtime"
$releaseDir = Join-Path $root "artifacts/releases/$Runtime"
$icon = Join-Path $root 'src/TaskTracker.App.Desktop/Assets/app.ico'

function Invoke-Checked
{
    param([string] $Command, [string[]] $Arguments)

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0)
    {
        throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

if (-not $Version)
{
    $Version = (dotnet msbuild $project -getProperty:Version).Trim()
}

foreach ($folder in $publishDir, $releaseDir)
{
    if (Test-Path $folder)
    {
        Remove-Item -Recurse -Force $folder
    }
}

Write-Host "Publishing Task Tracker $Version for $Runtime"
Invoke-Checked 'dotnet' @('publish', $project, '--configuration', 'Release', '--runtime', $Runtime,
    '--self-contained', 'true', "-p:Version=$Version", '--output', $publishDir)

Invoke-Checked 'dotnet' @('tool', 'restore')

$packArguments = @('vpk', 'pack',
    '--packId', $packId,
    '--packVersion', $Version,
    '--packTitle', 'Task Tracker',
    '--packAuthors', 'Task Tracker',
    '--packDir', $publishDir,
    '--mainExe', 'TaskTracker.App.Desktop.exe',
    '--runtime', $Runtime,
    '--icon', $icon,
    '--outputDir', $releaseDir)
Invoke-Checked 'dotnet' $packArguments

Write-Host "Release files in $releaseDir"
