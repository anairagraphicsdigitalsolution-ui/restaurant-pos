$taskName = "Anaira POS - Automatic Bidirectional Sync"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) { Write-Host "NOT INSTALLED" -ForegroundColor Yellow; exit 1 }
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host "Installed: YES" -ForegroundColor Green
Write-Host "State: $($task.State)"
Write-Host "LastRunTime: $($info.LastRunTime)"
Write-Host "LastTaskResult: $($info.LastTaskResult)"
Write-Host "NextRunTime: $($info.NextRunTime)"
