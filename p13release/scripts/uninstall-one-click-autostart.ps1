$ErrorActionPreference = "SilentlyContinue"
$taskName = "Anaira POS - Auto Start"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "Anaira POS Auto-Start removed."
