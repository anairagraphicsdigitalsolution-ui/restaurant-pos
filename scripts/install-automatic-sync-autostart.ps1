$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root '.env.local'
$launcher = Join-Path $root 'scripts\start-automatic-sync-after-docker.ps1'
$taskName = 'Anaira POS - Automatic Bidirectional Sync'

if (-not (Test-Path $envFile)) { throw ".env.local is missing: $envFile" }
if (-not (Test-Path $launcher)) { throw "Sync startup launcher not found: $launcher" }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed or node.exe is not on PATH.' }

$psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $launcher.Replace('"','\"') + '"'

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute $psExe -Argument $arguments -WorkingDirectory $root
# Do not use -Delay here: Windows PowerShell versions commonly do not support it.
# The launcher itself waits for Docker Engine before starting the sync worker.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ''
Write-Host 'Anaira automatic sync startup installed.' -ForegroundColor Green
Write-Host "Task: $taskName" -ForegroundColor Cyan
Write-Host "User: $env:USERNAME" -ForegroundColor Cyan
Write-Host 'The worker will start automatically at Windows logon after Docker is ready.' -ForegroundColor Green
Write-Host ''
