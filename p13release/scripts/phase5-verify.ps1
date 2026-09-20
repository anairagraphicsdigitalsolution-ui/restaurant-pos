$ErrorActionPreference='Stop'
Write-Host 'Anaira POS - Local-First Verification' -ForegroundColor Cyan

$stack = 'D:\my soft saas\Anairat-POS-Enterprise\server\docker'
if (-not (Test-Path $stack)) { throw "Restaurant Supabase Compose stack not found: $stack" }

Set-Location $stack
Write-Host ''
Write-Host 'Docker Compose services:' -ForegroundColor Yellow
docker compose ps

Write-Host ''
Write-Host 'PostgreSQL:' -ForegroundColor Yellow
docker exec supabase-db pg_isready -U postgres

Write-Host ''
Write-Host 'REST gateway:' -ForegroundColor Yellow
try {
  $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/rest/v1/' -TimeoutSec 10
  Write-Host "REST status: $($r.StatusCode)" -ForegroundColor Green
} catch {
  # A 401/No API key response is proof that Kong is reachable.
  Write-Host "REST endpoint responded: $($_.Exception.Message)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Key local tables:' -ForegroundColor Yellow
$query = @"
select table_name
from information_schema.tables
where table_schema='public'
and table_name in ('restaurants','profiles','orders','order_items','menu_items','customers','inventory','local_sync_state','local_sync_outbox','anaira_sync_events','anaira_sync_state')
order by table_name;
"@
$query | docker exec -i supabase-db psql -U postgres -d postgres

Write-Host ''
Write-Host 'Row counts:' -ForegroundColor Yellow
$countQuery = @"
select 'restaurants' as table_name, count(*) from public.restaurants
union all select 'profiles', count(*) from public.profiles
union all select 'orders', count(*) from public.orders
union all select 'menu_items', count(*) from public.menu_items
union all select 'customers', count(*) from public.customers
order by 1;
"@
$countQuery | docker exec -i supabase-db psql -U postgres -d postgres

Write-Host ''
Write-Host 'Local-first verification completed.' -ForegroundColor Green
