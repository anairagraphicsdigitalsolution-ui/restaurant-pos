$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$taskName = 'Anaira POS - Docker Auto-Start'

$dockerCandidates = @(
  (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
  (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
)
$dockerExe = $dockerCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $dockerExe) {
  $cmd = Get-Command 'Docker Desktop.exe' -ErrorAction SilentlyContinue
  if ($cmd) { $dockerExe = $cmd.Source }
}
if (-not $dockerExe) { throw 'Docker Desktop was not found. Install Docker Desktop first.' }

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute $dockerExe -WorkingDirectory (Split-Path $dockerExe -Parent)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ''
Write-Host 'Anaira POS - Docker Auto-Start installed.' -ForegroundColor Green
Write-Host "Task: $taskName" -ForegroundColor Cyan
Write-Host "Docker: $dockerExe" -ForegroundColor Cyan
Write-Host 'Docker Desktop will start automatically at Windows logon.' -ForegroundColor Green
Write-Host ''
