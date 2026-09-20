$ErrorActionPreference='Stop'
Write-Host 'Anaira POS - Local-First Cutover' -ForegroundColor Cyan
Write-Host ''
Write-Host 'This script is intentionally non-destructive.' -ForegroundColor Green
Write-Host 'It does NOT run supabase CLI, reset the database, or delete local data.' -ForegroundColor Green
Write-Host ''

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& powershell -ExecutionPolicy Bypass -File .\scripts\enable-local-mode.ps1
& powershell -ExecutionPolicy Bypass -File .\scripts\phase5-local-start.ps1
& powershell -ExecutionPolicy Bypass -File .\scripts\phase5-verify.ps1

Write-Host ''
Write-Host 'Next: start the bidirectional sync worker in a separate terminal:' -ForegroundColor Yellow
Write-Host '  powershell -ExecutionPolicy Bypass -File .\scripts\phase5-start-sync.ps1' -ForegroundColor White
Write-Host 'Then start the POS:' -ForegroundColor Yellow
Write-Host '  powershell -ExecutionPolicy Bypass -File .\scripts\run-local-pos.ps1' -ForegroundColor White
