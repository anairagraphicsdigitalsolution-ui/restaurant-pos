Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*powershell*" } | ForEach-Object {
  # Do not kill unrelated PowerShell processes. Use the listener's PID file if present.
}
$taskName="Anaira POS Print Bridge"
try { Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch {}
