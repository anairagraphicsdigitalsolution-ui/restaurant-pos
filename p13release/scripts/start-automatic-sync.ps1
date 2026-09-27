$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local is missing." }
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}
$env:ANAIRA_LOCAL_SERVER_ENABLED = "true"
$env:ANAIRA_LOCAL_PRIMARY = "true"
if (-not $env:NEXT_PUBLIC_SUPABASE_URL) { throw "NEXT_PUBLIC_SUPABASE_URL is missing from .env.local." }
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { throw "SUPABASE_SERVICE_ROLE_KEY is missing from .env.local." }
if (-not $env:ANAIRA_RESTAURANT_ID) { throw "ANAIRA_RESTAURANT_ID is missing from .env.local." }
if (-not $env:ANAIRA_SYNC_INTERVAL_MS) { $env:ANAIRA_SYNC_INTERVAL_MS = "5000" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed or not on PATH." }
$worker = Join-Path $root "scripts\sync-worker.mjs"
if (-not (Test-Path $worker)) { throw "Sync worker not found: $worker" }
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Anaira POS - Automatic Bidirectional Sync" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Restaurant: $env:ANAIRA_RESTAURANT_ID" -ForegroundColor Green
Write-Host "Interval:   $env:ANAIRA_SYNC_INTERVAL_MS ms" -ForegroundColor Green
Write-Host "Cloud:      $env:NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""
node $worker
if ($LASTEXITCODE -ne 0) { throw "Sync worker exited with code $LASTEXITCODE." }
