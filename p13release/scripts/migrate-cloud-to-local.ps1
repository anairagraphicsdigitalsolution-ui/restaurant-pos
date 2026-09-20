$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stack = Join-Path $root 'local-supabase/stack'
if (-not $env:SUPABASE_REMOTE_DB_URL) {
  $env:SUPABASE_REMOTE_DB_URL = Read-Host 'Enter the CURRENT Supabase Postgres connection string (from Dashboard > Connect)'
}
if (-not $env:SUPABASE_REMOTE_DB_URL) { throw 'SUPABASE_REMOTE_DB_URL is required.' }
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) { throw 'Supabase CLI is required.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required.' }

$backup = Join-Path $root 'local-supabase/backups'
New-Item -ItemType Directory -Force $backup | Out-Null

Write-Host 'Dumping current remote roles/schema/data with Supabase CLI...'
supabase db dump --db-url "$env:SUPABASE_REMOTE_DB_URL" -f (Join-Path $backup 'roles.sql') --role-only
supabase db dump --db-url "$env:SUPABASE_REMOTE_DB_URL" -f (Join-Path $backup 'schema.sql')
supabase db dump --db-url "$env:SUPABASE_REMOTE_DB_URL" -f (Join-Path $backup 'data.sql') --use-copy --data-only

Write-Host 'Restoring public/auth/storage-compatible dump into local Postgres...'
$pg = docker compose -f (Join-Path $stack 'docker-compose.yml') ps -q db
if (-not $pg) { throw 'Local Supabase db container is not running.' }
Get-Content (Join-Path $backup 'roles.sql') | docker exec -i $pg psql -U postgres -d postgres -v ON_ERROR_STOP=1
Get-Content (Join-Path $backup 'schema.sql') | docker exec -i $pg psql -U postgres -d postgres -v ON_ERROR_STOP=1
Get-Content (Join-Path $backup 'data.sql') | docker exec -i $pg psql -U postgres -d postgres -v ON_ERROR_STOP=1
Write-Host 'Database migration completed. Verify row counts before switching the POS to local primary.'
