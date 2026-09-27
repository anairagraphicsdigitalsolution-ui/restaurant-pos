$ErrorActionPreference = 'Stop'

# Anaira Local Restaurant Mode
# This script intentionally does NOT run `supabase start`/`supabase status`.
# The restaurant installation uses the existing self-hosted Docker Compose
# stack whose database container is named `supabase-db`.

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path '.env.local')) {
  throw '.env.local is missing. Create it from .env.local.example and fill in the local Supabase credentials.'
}

$env:NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY = 'true'
$env:ANAIRA_LOCAL_PRIMARY = 'true'
$env:ANAIRA_LOCAL_SERVER_ENABLED = 'true'

Write-Host 'Anaira POS - LOCAL PRIMARY mode' -ForegroundColor Cyan
Write-Host ''

$required = @(
  'NEXT_PUBLIC_LOCAL_SUPABASE_URL',
  'NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY',
  'SUPABASE_LOCAL_SERVICE_ROLE_KEY',
  'ANAIRA_RESTAURANT_ID'
)

foreach ($name in $required) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if (-not $value) {
    # Read from .env.local because PowerShell does not automatically import it.
    $line = Get-Content '.env.local' | Where-Object { $_ -match "^$([regex]::Escape($name))=(.*)$" } | Select-Object -First 1
    if ($line -match "^$([regex]::Escape($name))=(.*)$") {
      [Environment]::SetEnvironmentVariable($name, $matches[1], 'Process')
    }
  }
  if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
    throw "Missing $name in .env.local"
  }
}

$stack = [Environment]::GetEnvironmentVariable('LOCAL_SUPABASE_STACK_DIR','Process')
if (-not $stack) {
  $line = Get-Content '.env.local' | Where-Object { $_ -match '^LOCAL_SUPABASE_STACK_DIR=(.*)$' } | Select-Object -First 1
  if ($line -match '^LOCAL_SUPABASE_STACK_DIR=(.*)$') { $stack = $matches[1].Trim() }
}

if ($stack -and (Test-Path (Join-Path $stack 'docker-compose.yml'))) {
  Write-Host 'Checking restaurant Supabase Docker stack...' -ForegroundColor Yellow
  docker compose --project-directory $stack ps
} else {
  Write-Host 'Using the already-running local Supabase stack. Compose directory check skipped.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Starting Anaira POS against LOCAL Supabase...' -ForegroundColor Green
npm run dev -- -H 0.0.0.0
