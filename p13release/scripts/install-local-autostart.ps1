$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Anaira POS - Local Auto-Start Setup' -ForegroundColor Cyan
Write-Host ''

& (Join-Path $root 'scripts\install-docker-autostart.ps1')
& (Join-Path $root 'scripts\install-automatic-sync-autostart.ps1')

Write-Host 'Local auto-start setup completed.' -ForegroundColor Green
Write-Host 'Windows logon -> Docker Desktop -> Docker Engine ready -> Anaira Sync Worker.' -ForegroundColor Green
