$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root '.env.local'
if (-not (Test-Path $envFile)) { throw '.env.local is missing.' }

# Load only the variables needed by the server-side sync worker. Values are
# kept in-process and are never echoed.
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([^#=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim()
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

$env:ANAIRA_LOCAL_PRIMARY = 'true'
$env:ANAIRA_LOCAL_SERVER_ENABLED = 'true'

if (-not $env:SUPABASE_CLOUD_DB_URL) {
  throw 'SUPABASE_CLOUD_DB_URL is missing from .env.local. It is required for cloud synchronization.'
}
if (-not $env:ANAIRA_RESTAURANT_ID) {
  throw 'ANAIRA_RESTAURANT_ID is missing from .env.local.'
}

$worker = Join-Path $root 'scripts\sync-worker.mjs'
if (-not (Test-Path $worker)) { throw "Sync worker not found: $worker" }

Write-Host 'Starting Anaira bidirectional sync worker...' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop.' -ForegroundColor Yellow
node $worker
if ($LASTEXITCODE -ne 0) { throw "Sync worker exited with code $LASTEXITCODE." }
