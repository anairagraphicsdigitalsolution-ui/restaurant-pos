$ErrorActionPreference='SilentlyContinue'
Start-Process "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"$PSScriptRoot\launch-pos-background.ps1" -WindowStyle Hidden
Start-Sleep -Seconds 3
$edge = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
  Start-Process $edge -ArgumentList '--app=http://127.0.0.1:3000/admin'
} else {
  Start-Process 'http://127.0.0.1:3000/admin'
}
