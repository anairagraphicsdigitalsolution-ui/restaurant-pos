$ErrorActionPreference = "Stop"
$taskName = "Anaira POS - Automatic Bidirectional Sync"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Anaira automatic sync startup removed." -ForegroundColor Green
} else {
  Write-Host "Anaira automatic sync startup was not installed." -ForegroundColor Yellow
}
