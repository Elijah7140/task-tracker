#Requires -Version 7.4
<#
.SYNOPSIS
    Stops this checkout's unpacked Electron build, pulls, packages and runs it on Windows.
#>
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$repoRoot = Split-Path -Parent $PSScriptRoot
$exePath = Join-Path $repoRoot 'apps\desktop\dist\package\win-unpacked\task-tracker.exe'
$sessionId = (Get-Process -Id $PID).SessionId

$running = Get-Process -Name 'task-tracker' -ErrorAction SilentlyContinue |
    Where-Object { $_.SessionId -eq $sessionId -and $_.Path -eq $exePath }

foreach ($process in $running) {
    if ($process.MainWindowHandle -ne 0) {
        [void] $process.CloseMainWindow()
        [void] $process.WaitForExit(3000)
    }
}
foreach ($process in $running) {
    if (!$process.HasExited) {
        $process.Kill()
        $process.WaitForExit()
    }
}

Push-Location $repoRoot
try {
    git pull --ff-only
    pnpm install --frozen-lockfile
    pnpm run package:desktop
    Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath)
} finally {
    Pop-Location
}
