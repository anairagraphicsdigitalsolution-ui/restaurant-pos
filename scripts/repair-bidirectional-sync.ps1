$ErrorActionPreference = 'Stop'

if (-not $env:SUPABASE_CLOUD_DB_URL) { throw 'SUPABASE_CLOUD_DB_URL is required.' }

Write-Host 'Anaira sync repair: local event schema' -ForegroundColor Cyan
@'
ALTER TABLE public.anaira_sync_events ADD COLUMN IF NOT EXISTS restaurant_id uuid;
CREATE INDEX IF NOT EXISTS anaira_sync_events_restaurant_idx ON public.anaira_sync_events(restaurant_id,id);
'@ | docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres

Write-Host 'Anaira sync repair: LOCAL trigger' -ForegroundColor Yellow
Get-Content .\scripts\update-sync-trigger.sql | docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres

Write-Host 'Anaira sync repair: CLOUD trigger' -ForegroundColor Yellow
Get-Content .\scripts\update-cloud-sync-trigger.sql | docker run --rm -i postgres:17 psql -v ON_ERROR_STOP=1 "$env:SUPABASE_CLOUD_DB_URL"

Write-Host 'Sync repair completed.' -ForegroundColor Green
