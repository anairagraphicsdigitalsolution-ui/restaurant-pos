$ErrorActionPreference='Stop'

Write-Host 'Anaira POS Phase 5 - Fresh Cloud -> Local Migration' -ForegroundColor Cyan

function Need([string]$cmd,[string]$hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd is required. $hint" }
}

Need 'docker' 'Install/start Docker Desktop.'
Need 'npx' 'Install Node.js LTS.'
Need 'pg_dump' 'Install PostgreSQL client tools and ensure pg_dump is on PATH.'
Need 'psql' 'Install PostgreSQL client tools and ensure psql is on PATH.'

if (-not $env:SUPABASE_CLOUD_DB_URL) { throw 'Set SUPABASE_CLOUD_DB_URL to the cloud Postgres connection string before running this script.' }

$root = (Get-Location).Path
$backupDir = Join-Path $root 'backups\phase5'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dump = Join-Path $backupDir "cloud-$stamp.dump"
$meta = Join-Path $backupDir "cloud-$stamp.meta.txt"

Write-Host 'Starting local Supabase...' -ForegroundColor Yellow
npx supabase start | Out-Host

$status = npx supabase status -o env 2>$null
$localDbUrl = (($status -split "`r?`n" | Where-Object { $_ -like 'DB_URL=*' }) -replace '^DB_URL=','').Trim('"')
if (-not $localDbUrl) { throw 'Could not read local DB_URL from Supabase status.' }

Write-Host "Creating fresh cloud backup: $dump" -ForegroundColor Yellow
pg_dump --dbname="$env:SUPABASE_CLOUD_DB_URL" --format=custom --no-owner --no-privileges --file="$dump"

@"
Created: $(Get-Date -Format o)
Source: Cloud Supabase PostgreSQL
Dump: $dump
Target: Local Supabase PostgreSQL
"@ | Set-Content -Encoding UTF8 $meta

Write-Host 'Restoring fresh cloud database into local Supabase...' -ForegroundColor Yellow
pg_restore --dbname="$localDbUrl" --clean --if-exists --no-owner --no-privileges --exit-on-error "$dump"

Write-Host 'Applying local sync migration...' -ForegroundColor Yellow
$mig = Join-Path $root 'supabase\migrations\99999999999999_anaira_bidirectional_sync.sql'
if (-not (Test-Path $mig)) { throw "Missing migration: $mig" }
psql --dbname="$localDbUrl" --set ON_ERROR_STOP=1 --file="$mig"

Write-Host 'Running verification...' -ForegroundColor Yellow
$verify = Join-Path $root 'scripts\phase5-verify.ps1'
& powershell -ExecutionPolicy Bypass -File $verify

Write-Host "Phase 5 migration completed. Backup saved at: $dump" -ForegroundColor Green
