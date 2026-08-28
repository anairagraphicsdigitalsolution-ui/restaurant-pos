$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$taskName = "Anaira POS - Auto Start"

# Find PowerShell executable.
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$launcher = Join-Path $root "scripts\anaira-startup.ps1"

$action = New-ScheduledTaskAction -Execute $ps `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Anaira POS Auto-Start installed successfully." -ForegroundColor Green
Write-Host "Task: $taskName"
Write-Host "Docker + local stack + POS will start at Windows logon."
