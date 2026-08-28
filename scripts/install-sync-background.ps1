$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serviceScript = Join-Path $root "scripts\anaira-sync-background.ps1"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskName = "Anaira POS - Automatic Bidirectional Sync"

# Remove old task if present.
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $ps `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$serviceScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Anaira background sync installed." -ForegroundColor Green
Write-Host "Task: $taskName"
Write-Host "Worker runs hidden and restarts automatically if it exits."
