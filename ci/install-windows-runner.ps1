#Requires -Version 7
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs a self-hosted GitHub Actions runner for Task Tracker CI on this Windows machine.

.DESCRIPTION
    Downloads the newest runner release to -InstallPath, registers it with the labels
    self-hosted, windows and x64, and installs it as a Windows service that starts with the
    machine (docs/CI.md). The runner keeps itself up to date after that.

    Get the registration token from the repository's Settings > Actions > Runners >
    New self-hosted runner. It expires after an hour.

.PARAMETER Token
    The registration token.

.PARAMETER RepositoryUrl
    The repository the runner serves.

.PARAMETER InstallPath
    Where the runner is installed. Keep it short: deep paths can exceed Windows' path limit.

.EXAMPLE
    ./ci/install-windows-runner.ps1 -Token AAAA...
#>
param(
    [Parameter(Mandatory)] [string] $Token,
    [string] $RepositoryUrl = 'https://github.com/Elijah7140/task-tracker',
    [string] $InstallPath = 'C:\actions-runner',
    [string] $RunnerName = "$env:COMPUTERNAME-tasktracker"
)
$ErrorActionPreference = 'Stop'

function Get-LatestRunnerVersion
{
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest'
    return $release.tag_name.TrimStart('v')
}

function Install-RunnerFiles
{
    param([string] $Version)

    $zipName = "actions-runner-win-x64-$Version.zip"
    $zipPath = Join-Path $InstallPath $zipName
    $downloadUrl = "https://github.com/actions/runner/releases/download/v$Version/$zipName"

    New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $InstallPath -Force
    Remove-Item -LiteralPath $zipPath
}

function Register-Runner
{
    $configScript = Join-Path $InstallPath 'config.cmd'
    & $configScript --unattended --replace `
        --url $RepositoryUrl `
        --token $Token `
        --name $RunnerName `
        --labels 'windows,x64' `
        --work '_work' `
        --runasservice
    if ($LASTEXITCODE -ne 0)
    {
        throw "Runner registration failed with exit code $LASTEXITCODE."
    }
}

if (Test-Path (Join-Path $InstallPath '.runner'))
{
    throw "A runner is already registered in $InstallPath. Remove it first with config.cmd remove."
}

$version = Get-LatestRunnerVersion
Write-Host "Installing GitHub Actions runner $version to $InstallPath"
Install-RunnerFiles -Version $version
Register-Runner
Write-Host 'The runner is installed as a service and online. Now set the repository variable CI_WINDOWS_SELF_HOSTED to true.'
