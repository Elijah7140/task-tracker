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

.PARAMETER UpdateFeedUrl
    The public GitHub repository for updates. Defaults to TaskTrackerUpdateFeedUrl in Directory.Build.props.

.EXAMPLE
    ./scripts/pack.ps1
    ./scripts/pack.ps1 -Runtime win-x64 -Version 0.2.0
#>
param(
    [string] $Runtime = 'win-x64',
    [string] $Version = '',
    [string] $UpdateFeedUrl = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Not 'TaskTracker': Velopack installs to %LocalAppData%\<packId> and deletes that whole folder on
# uninstall, while the database lives in %LocalAppData%\TaskTracker (§7.13). Keep in step with pack.sh.
$packId = 'TaskTrackerApp'

if ($Runtime -cnotin @('win-x64', 'linux-x64', 'osx-arm64'))
{
    throw "Unsupported runtime '$Runtime'. Use win-x64, linux-x64, or osx-arm64."
}

$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).ProviderPath
$project = Join-Path $root 'src/TaskTracker.App.Desktop/TaskTracker.App.Desktop.csproj'
$artifactsDir = Join-Path $root 'artifacts'
$icon = Join-Path $root 'src/TaskTracker.App.Desktop/Assets/app.ico'

function Get-SafeOutputDirectory
{
    param([string] $Kind)

    $parent = Join-Path $artifactsDir $Kind
    $folder = [IO.Path]::GetFullPath((Join-Path $parent $Runtime))
    $prefix = $artifactsDir + [IO.Path]::DirectorySeparatorChar
    if (-not $folder.StartsWith($prefix, [StringComparison]::Ordinal))
    {
        throw "Output directory '$folder' must stay under '$artifactsDir'."
    }

    foreach ($path in $artifactsDir, $parent, $folder)
    {
        $entry = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        if ($null -ne $entry -and ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint))
        {
            throw "Output path '$path' must not be a symbolic link or junction."
        }
    }

    return $folder
}

function Invoke-Checked
{
    param([string] $Command, [string[]] $Arguments)

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0)
    {
        throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

$publishDir = Get-SafeOutputDirectory 'publish'
$releaseDir = Get-SafeOutputDirectory 'releases'

Push-Location -LiteralPath $root
try
{
    if (-not $Version)
    {
        $Version = (Invoke-Checked 'dotnet' @('msbuild', $project, '-getProperty:Version')).Trim()
    }

    foreach ($folder in $publishDir, $releaseDir)
    {
        if (Test-Path -LiteralPath $folder)
        {
            Remove-Item -LiteralPath $folder -Recurse -Force
        }
    }

    Write-Host "Publishing Task Tracker $Version for $Runtime"
    $publishArguments = @('publish', $project, '--configuration', 'Release', '--runtime', $Runtime,
        '--self-contained', 'true', "-p:Version=$Version", '--output', $publishDir)
    if ($UpdateFeedUrl)
    {
        $publishArguments += "-p:TaskTrackerUpdateFeedUrl=$UpdateFeedUrl"
    }
    Invoke-Checked 'dotnet' $publishArguments

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
}
finally
{
    Pop-Location
}
