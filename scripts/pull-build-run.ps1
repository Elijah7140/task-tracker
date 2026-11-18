#Requires -Version 7
<#
.SYNOPSIS
    Closes the running app, pulls the current branch, rebuilds the desktop app and starts it.

.DESCRIPTION
    Closes any running Task Tracker before pulling: the pull and build cannot overwrite files a
    running exe holds open, and the single-instance guard would hand the new launch to the old
    window. Each copy in this Windows session is asked to close its window and gets 3 seconds to
    exit; a copy that hid to the tray, or was already hidden there, is then stopped. Each change is
    saved as it is made, so only text still being typed in an open dialog could be lost.

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

function Get-TaskTrackerProcess
{
    $sessionId = (Get-Process -Id $PID).SessionId
    Get-Process -Name $processName -ErrorAction SilentlyContinue |
        Where-Object SessionId -eq $sessionId
}

function Stop-TaskTracker
{
    $running = @(Get-TaskTrackerProcess)
    if ($running.Count -eq 0)
    {
        return
    }

    Write-Host "Closing $($running.Count) running Task Tracker window(s)..."
    foreach ($process in $running)
    {
        if ($process.MainWindowHandle -ne 0)
        {
            [void]$process.CloseMainWindow()
        }
    }

    foreach ($process in $running)
    {
        Wait-TaskTrackerExit $process
    }
}

function Wait-TaskTrackerExit
{
    param([System.Diagnostics.Process] $Process)

    # A copy that keeps running in the tray hides instead of exiting, and a hidden copy has no
    # window to close, so whatever is still running after a short wait is stopped.
    if ($Process.WaitForExit(3000))
    {
        return
    }

    $Process.Kill()
    $Process.WaitForExit()
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

Stop-TaskTracker
Invoke-Native 'git pull' { git -C $repoRoot pull --ff-only }
Invoke-Native 'dotnet build' { dotnet build $projectPath }
Set-ExeSignature
Start-Process -FilePath $exePath -WorkingDirectory $outputFolder
