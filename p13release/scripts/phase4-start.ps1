$ErrorActionPreference='Stop'
Write-Host 'Anaira POS Phase 4 - Local Supabase' -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required.' }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is required.' }
if (-not (Test-Path '.\supabase\config.toml')) { throw 'Run this from the Anaira POS project root.' }
Write-Host 'Starting full local Supabase stack...' -ForegroundColor Yellow
npx supabase start
$status = npx supabase status -o env 2>$null
$envMap=@{}
foreach($line in ($status -split "`r?`n")) { if($line -match '^([^=]+)=(.*)$'){ $envMap[$matches[1]]=$matches[2].Trim('"') } }
$api = $envMap['API_URL']; $anon=$envMap['ANON_KEY']; $service=$envMap['SERVICE_ROLE_KEY']; $db=$envMap['DB_URL']
if(-not $api -or -not $anon -or -not $service){ Write-Host $status; throw 'Could not read local Supabase credentials from supabase status.' }
@"
NEXT_PUBLIC_SUPABASE_URL=$env:NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$($envMap['ANON_KEY'])
NEXT_PUBLIC_LOCAL_SUPABASE_URL=$($api)
NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY=$($anon)
SUPABASE_LOCAL_SERVICE_ROLE_KEY=$($service)
ANAIRA_LOCAL_PRIMARY=true
ANAIRA_LOCAL_SERVER_ENABLED=true
SUPABASE_LOCAL_DB_URL=$($db)
SUPABASE_CLOUD_DB_URL=$env:SUPABASE_CLOUD_DB_URL
"@ | Set-Content -Encoding UTF8 '.env.local.phase4'
Write-Host "Local Supabase API: $api" -ForegroundColor Green
Write-Host 'Run: npm run dev  (or npm run start after build)' -ForegroundColor Green
Write-Host 'Then open the POS from the local server/LAN.' -ForegroundColor Green
