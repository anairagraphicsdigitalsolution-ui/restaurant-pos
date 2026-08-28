$ErrorActionPreference='Stop'
if (-not $env:SUPABASE_CLOUD_DB_URL) { throw 'SUPABASE_CLOUD_DB_URL is required.' }
if (-not $env:SUPABASE_LOCAL_DB_URL) { throw 'SUPABASE_LOCAL_DB_URL is required.' }
$env:ANAIRA_SYNC_NODE='restaurant-local-server'
node .\scripts\sync-worker.mjs
