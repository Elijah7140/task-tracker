$ErrorActionPreference = 'Stop'
 
Push-Location $PSScriptRoot
try {
& git pull
    if ($LASTEXITCODE -ne 0) {
        throw "git pull failed with exit code $LASTEXITCODE."
    }
 
    $runningProcesses = @(Get-Process -Name 'task-tracker' -ErrorAction SilentlyContinue)
    foreach ($process in $runningProcesses) {
        if ($process.MainWindowHandle -ne 0) {
            [void]$process.CloseMainWindow()
        }
    }
 
    foreach ($process in $runningProcesses) {
        if (-not $process.WaitForExit(10000)) {
            Stop-Process -Id $process.Id -Force
            $process.WaitForExit()
        }
    }
 
    & dotnet build task-tracker.slnx
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet build failed with exit code $LASTEXITCODE."
    }
 
     pwsh -noprofile -Command "Get-ChildItem src\task-tracker\bin\Debug\net10.0-windows\win-x64\ | where name -like *.exe | Set-MpgAssemblySigned -CertificatePath 'Cert:\CurrentUser\My' -FriendlyNameSearch '*PCA MAD*'"
 
    Start-Process -FilePath (Join-Path $PSScriptRoot 'src\task-tracker\bin\Debug\net10.0-windows\win-x64\task-tracker.exe')
}
finally {
    Pop-Location
}