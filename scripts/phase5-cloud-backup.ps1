$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_CLOUD_DB_URL) {
  throw "SUPABASE_CLOUD_DB_URL is not set. Set it in this PowerShell session first."
}

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "phase5-backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $backupDir "cloud-public-data-$stamp.sql"

Write-Host "Phase 5: exporting Cloud public data (read-only source)..."
Write-Host "Output: $outFile"
Write-Host "Using PostgreSQL 17 pg_dump container to match the Cloud server version..."

# The Cloud server is PostgreSQL 17.x while the local Supabase DB image may be PostgreSQL 15.x.
# pg_dump must be the same major version or newer than the server. Use the official postgres:17 client image.
docker run --rm `
  -e "PGDATABASE=postgres" `
  postgres:17 `
  pg_dump "$env:SUPABASE_CLOUD_DB_URL" `
  --data-only `
  --schema=public `
  --no-owner `
  --no-privileges `
  --format=plain `
  | Out-File -FilePath $outFile -Encoding utf8

if ($LASTEXITCODE -ne 0) {
  Remove-Item -Force -ErrorAction SilentlyContinue $outFile
  throw "Cloud pg_dump failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path $outFile) -or (Get-Item $outFile).Length -eq 0) {
  Remove-Item -Force -ErrorAction SilentlyContinue $outFile
  throw "Cloud export produced an empty backup file."
}

Write-Host "Cloud data export completed successfully."
Write-Host "Backup: $outFile"
