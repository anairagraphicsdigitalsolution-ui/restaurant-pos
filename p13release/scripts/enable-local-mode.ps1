$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path '.env.local')) {
  throw '.env.local is missing.'
}

function Read-EnvValue([string]$file, [string]$name) {
  if (-not (Test-Path $file)) { return '' }
  $line = Get-Content $file | Where-Object { $_ -match "^$([regex]::Escape($name))=(.*)$" } | Select-Object -First 1
  if ($line -match "^$([regex]::Escape($name))=(.*)$") { return $matches[1].Trim() }
  return ''
}

$localSource = Join-Path $root 'supabase-studio-recreate.env'
$localAnon = Read-EnvValue $localSource 'SUPABASE_ANON_KEY'
$localService = Read-EnvValue $localSource 'SUPABASE_SERVICE_KEY'
if (-not $localService) { $localService = Read-EnvValue $localSource 'SUPABASE_SERVICE_ROLE_KEY' }

# If the local Studio recreation env exists, reuse its already-validated local
# JWT credentials without printing them to the terminal.
$values = [ordered]@{
  'NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY' = 'true'
  'ANAIRA_LOCAL_PRIMARY' = 'true'
  'NEXT_PUBLIC_LOCAL_SUPABASE_URL' = 'http://127.0.0.1:8000'
  'ANAIRA_LOCAL_SERVER_ENABLED' = 'true'
  'LOCAL_DATABASE_URL' = 'postgresql://supabase_admin@127.0.0.1:54322/postgres'
  'LOCAL_DB_CONTAINER' = 'supabase-db'
  'LOCAL_DB_USER' = 'supabase_admin'
  'LOCAL_DB_NAME' = 'postgres'
}

if ($localAnon) { $values['NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY'] = $localAnon }
if ($localService) {
  $values['SUPABASE_LOCAL_SERVICE_ROLE_KEY'] = $localService
  # Local-primary is a desktop/local-network installation. The local service key
  # is intentionally exposed only to this local POS data plane; never use this
  # setting for a public cloud deployment.
}

$content = Get-Content '.env.local'
foreach ($name in $values.Keys) {
  $escaped = [regex]::Escape($name)
  $newLine = "$name=$($values[$name])"
  $found = $false
  $content = @($content | ForEach-Object {
    if ($_ -match "^$escaped=") { $script:found = $true; $newLine } else { $_ }
  })
  if (-not $found) { $content += $newLine }
}

Set-Content '.env.local' $content -Encoding UTF8
Write-Host 'Local-primary environment enabled.' -ForegroundColor Green
Write-Host 'Cloud NEXT_PUBLIC_SUPABASE_* values were preserved.' -ForegroundColor Green

if (-not $localAnon -or -not $localService) {
  Write-Host 'Local key values were not found in supabase-studio-recreate.env.' -ForegroundColor Yellow
  Write-Host 'Fill NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY and SUPABASE_LOCAL_SERVICE_ROLE_KEY in .env.local before starting the POS.' -ForegroundColor Yellow
}

Write-Host 'Run scripts/run-local-pos.ps1 to start the restaurant POS.' -ForegroundColor Cyan
