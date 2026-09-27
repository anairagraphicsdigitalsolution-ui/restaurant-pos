$ErrorActionPreference='Stop'
Write-Host 'Checking local Supabase...' -ForegroundColor Cyan
npx supabase status
Write-Host 'Checking local API...' -ForegroundColor Cyan
$status = npx supabase status -o env 2>$null
$api = (($status -split "`r?`n" | Where-Object { $_ -like 'API_URL=*' }) -replace '^API_URL=','').Trim('"')
if(-not $api){ throw 'Could not read API_URL.' }
try { $r=Invoke-WebRequest -UseBasicParsing "$api/rest/v1/" -TimeoutSec 10; Write-Host "REST API reachable: $($r.StatusCode)" -ForegroundColor Green } catch { Write-Host "REST endpoint check returned: $($_.Exception.Message)" -ForegroundColor Yellow }
