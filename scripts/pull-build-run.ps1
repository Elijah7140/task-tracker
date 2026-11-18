#Requires -Version 7
<#
.SYNOPSIS
    Pulls the current branch, rebuilds the desktop app and starts it.

.DESCRIPTION
    Closes any running Task Tracker first: the build cannot overwrite a running exe, and the
    single-instance guard would hand the new launch to the old window. Each copy gets 10 seconds
    to close (it may only minimise to the tray) before it is stopped.

    When the Set-MpgAssemblySigned cmdlet is available, the built exe is signed with the first
    certificate in Cert:\CurrentUser\My whose friendly name matches *PCA MAD*. Without the
    cmdlet, signing is skipped.

.EXAMPLE
    ./scripts/pull-build-run.ps1
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot 'src/TaskTracker.App.Desktop/TaskTracker.App.Desktop.csproj'
$outputFolder = Join-Path $repoRoot 'src/TaskTracker.App.Desktop/bin/Debug/net10.0'
$exePath = Join-Path $outputFolder 'TaskTracker.App.Desktop.exe'
$processName = 'TaskTracker.App.Desktop'

function Invoke-Native
{
    param([string] $Description, [scriptblock] $Command)

    & $Command
    if ($LASTEXITCODE -ne 0)
    {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

function Stop-TaskTracker
{
    $running = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
    foreach ($process in $running)
    {
        if ($process.MainWindowHandle -ne 0)
        {
            [void]$process.CloseMainWindow()
        }
    }

    foreach ($process in $running)
    {
        if (-not $process.WaitForExit(10000))
        {
            Stop-Process -Id $process.Id -Force
            $process.WaitForExit()
        }
    }
}

function Set-ExeSignature
{
    if (-not (Get-Command Set-MpgAssemblySigned -ErrorAction SilentlyContinue))
    {
        Write-Host 'Set-MpgAssemblySigned is not available; skipping signing.'
        return
    }

    Get-Item $exePath | Set-MpgAssemblySigned -CertificatePath 'Cert:\CurrentUser\My' -FriendlyNameSearch '*PCA MAD*'
}

Invoke-Native 'git pull' { git -C $repoRoot pull --ff-only }
Stop-TaskTracker
Invoke-Native 'dotnet build' { dotnet build $projectPath }
Set-ExeSignature
Start-Process -FilePath $exePath -WorkingDirectory $outputFolder
