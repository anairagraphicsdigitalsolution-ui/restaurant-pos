$ErrorActionPreference = "SilentlyContinue"

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*scripts*sync-worker.mjs*"
  } |
  ForEach-Object {
    Write-Host "Stopping sync worker PID $($_.ProcessId)..." -ForegroundColor Yellow
    Stop-Process -Id $_.ProcessId -Force
  }

Write-Host "Automatic sync worker stopped." -ForegroundColor Green
