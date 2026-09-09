$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$bridge = Join-Path $root 'scripts\print-bridge\AnairaPrintBridge.ps1'
Write-Host '===============================================' -ForegroundColor Cyan
Write-Host ' ANAIRA MPT-III PRINTER SETUP' -ForegroundColor Cyan
Write-Host '===============================================' -ForegroundColor Cyan
Write-Host ''

# Ensure Bluetooth service is running.
$svc = Get-Service bthserv -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne 'Running') { Start-Service bthserv -ErrorAction SilentlyContinue }
if ($svc) { Write-Host 'Bluetooth Support Service: OK' -ForegroundColor Green }

# The browser talks to the local Windows bridge. HttpListener needs a URL ACL.
# Add the reservation for the current Windows account; if it already exists,
# keep going.
Write-Host 'Configuring local print bridge URL...' -ForegroundColor Yellow
try {
  netsh http add urlacl url=http://127.0.0.1:3211/ user="$env:USERDOMAIN\$env:USERNAME" 2>$null | Out-Null
} catch {}
try {
  netsh http add urlacl url=http://127.0.0.1:3211/ user="$env:USERNAME" 2>$null | Out-Null
} catch {}

# Install startup launcher.
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
$startup = Join-Path $startupDir 'AnairaPrintBridge.cmd'
$cmd = "@echo off`r`ncd /d `"$root`"`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bridge`"`r`n"
Set-Content -Path $startup -Value $cmd -Encoding ASCII
Write-Host 'Windows Startup: configured' -ForegroundColor Green

# Open Bluetooth settings so pairing can be completed.
Start-Process 'ms-settings:bluetooth'
Write-Host ''
Write-Host 'PAIR MPT-III IN WINDOWS BLUETOOTH FIRST.' -ForegroundColor Yellow
Write-Host 'After pairing, verify Device Manager -> Ports (COM & LPT).' -ForegroundColor Yellow
Write-Host ''

# Stop an old bridge on this port if one is running, then start Anaira bridge.
try {
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'AnairaPrintBridge\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

Write-Host 'Starting Anaira Print Bridge...' -ForegroundColor Yellow
Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$bridge) -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3211/health' -Method Get -TimeoutSec 3
  Write-Host 'Anaira Print Bridge: RUNNING on 127.0.0.1:3211' -ForegroundColor Green
  Write-Host "Saved COM: $($health.saved_port)" -ForegroundColor Gray
  $ports = @($health.printers)
  if ($ports.Count) {
    Write-Host 'Detected COM ports:' -ForegroundColor Green
    $ports | Select-Object port,name,description | Format-Table -AutoSize
  } else {
    Write-Host 'Bridge is running, but no COM printer is visible yet.' -ForegroundColor Yellow
  }
} catch {
  Write-Host 'Anaira Print Bridge DID NOT START.' -ForegroundColor Red
  Write-Host "Reason: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Run scripts\print-bridge\START-ANAIRA-PRINT-BRIDGE.bat to see the exact error." -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
