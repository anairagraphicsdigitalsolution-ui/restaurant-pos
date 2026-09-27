$ErrorActionPreference = "Stop"
$tasks = @("Anaira POS - Local Docker Stack","Anaira POS - Automatic Bidirectional Sync")
foreach ($task in $tasks) {
  if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false
  }
}
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Docker Desktop" -ErrorAction SilentlyContinue
Write-Host "Anaira local auto-start removed." -ForegroundColor Green
