$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "phase5-backups"

if (-not (Test-Path $backupDir)) { throw "No phase5-backups directory found." }

$latest = Get-ChildItem $backupDir -Filter "cloud-public-data-*.sql" |
  Where-Object { $_.Name -notlike "cloud-public-data-restore-clean-*.sql" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $latest) { throw "No Cloud public-data backup found. Run npm run phase5:cloud:backup first." }

$container="supabase-db"
$running=docker inspect $container --format "{{.State.Running}}" 2>$null
if($LASTEXITCODE -ne 0 -or $running -ne "true"){throw "Local Supabase database container is not running."}

Write-Host "Phase 5: checking Cloud -> Local public schema compatibility..."
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "phase5-schema-compat.ps1")
if($LASTEXITCODE -ne 0){throw "Schema compatibility step failed."}

Write-Host ""
Write-Host "Phase 5: REPLACING LOCAL DATA WITH CLOUD DATA."
Write-Host "Backup: $($latest.FullName)"
Write-Host "Target: Local Supabase PostgreSQL (container $container)"
Write-Host ""
Write-Host "IMPORTANT: existing Local application DATA will be deleted."
Write-Host "The Local SCHEMA is preserved."
Write-Host "The Cloud database is NOT modified."
Write-Host "This does NOT run supabase db reset."
Write-Host ""
$answer=Read-Host "Type REPLACE to continue"
if($answer -ne "REPLACE"){Write-Host "Replacement cancelled."; exit 0}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "phase5-local-data-merge.ps1") -BackupFile $latest.FullName
if($LASTEXITCODE -ne 0){throw "Local data replacement failed with exit code $LASTEXITCODE."}

Write-Host "Local data replacement completed successfully."
