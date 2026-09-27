$ErrorActionPreference='Stop'
if (-not $env:SUPABASE_CLOUD_DB_URL) { throw 'Set SUPABASE_CLOUD_DB_URL to the production Supabase Postgres connection string first.' }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is required.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required.' }
Write-Host 'Starting local Supabase...' -ForegroundColor Cyan
npx supabase start | Out-Host
$container = (docker ps --format '{{.Names}}' | Select-String '^supabase_db_' | Select-Object -First 1).ToString().Trim()
if (-not $container) { throw 'Could not find local Supabase DB container.' }
Write-Host "Local DB container: $container" -ForegroundColor Green
$schema = Join-Path $PWD 'supabase\schema.sql'
$data = Join-Path $PWD 'supabase\data-backup.sql'
if (-not (Test-Path $schema) -or -not (Test-Path $data)) { throw 'Cloud schema/data dump files are missing.' }
Write-Host 'Restoring current schema/data snapshot into local Supabase...' -ForegroundColor Yellow
Get-Content $schema -Raw | docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Host
Get-Content $data -Raw | docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Host
Write-Host 'Applying Anaira sync migration...' -ForegroundColor Yellow
$mig = Join-Path $PWD 'supabase\migrations\99999999999999_anaira_bidirectional_sync.sql'
Get-Content $mig -Raw | docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Host
Write-Host 'Initial local restore completed. Start sync worker with npm run sync:worker after configuring SUPABASE_LOCAL_DB_URL.' -ForegroundColor Green
