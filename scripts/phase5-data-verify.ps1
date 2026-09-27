$ErrorActionPreference = "Stop"

Write-Host "Anaira POS Phase 5 - Data Verification"
Write-Host ""

$containers = @(
  "supabase-db",
  "supabase-meta",
  "supabase-auth",
  "supabase-storage",
  "realtime-dev.supabase-realtime",
  "supabase-analytics"
)

foreach ($name in $containers) {
  $status = docker inspect $name --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host ("{0,-32} {1}" -f $name, $status)
  } else {
    Write-Host ("{0,-32} NOT FOUND" -f $name)
  }
}

Write-Host ""
Write-Host "Checking local PostgreSQL..."
docker exec $containers[0] psql -U postgres -d postgres -tAc "select current_database(), current_user, now();"
if ($LASTEXITCODE -ne 0) {
  throw "Local PostgreSQL connection failed."
}

Write-Host ""
Write-Host "Checking key application tables..."
$query = @"
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('profiles','restaurants','orders','order_items','order_tokens','plugin_settings')
order by table_name;
"@
$query | docker exec -i $containers[0] psql -U postgres -d postgres
if ($LASTEXITCODE -ne 0) {
  throw "Application table verification failed."
}

Write-Host ""
Write-Host "Row counts:"
$countQuery = @"
select 'restaurants' as table_name, count(*) from public.restaurants
union all select 'profiles', count(*) from public.profiles
union all select 'orders', count(*) from public.orders
union all select 'order_items', count(*) from public.order_items
union all select 'order_tokens', count(*) from public.order_tokens
union all select 'plugin_settings', count(*) from public.plugin_settings
order by 1;
"@
$countQuery | docker exec -i $containers[0] psql -U postgres -d postgres

Write-Host ""
Write-Host "Phase 5 data verification completed."
